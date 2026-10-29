import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { API_BASE_URL, TUNNEL_URL } from "~/lib/api";
import type {
  GlissProfilingHandle,
  GlissProfilingOptions,
  StartProfiling,
} from "~/lib/gliss-profiling";

export type DesktopConnectionState =
  "connecting" | "connected" | "reconnecting" | "error" | "disconnected";

/** Delays before each automatic reconnect attempt after a dropped session. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000, 10000, 10000];

/** Time to let the window settle before asking the guest to resize. */
const RESIZE_DEBOUNCE_MS = 250;

/** The gliss browser client, served by the backend to match its gliss-server. */
type GlissEvent = { type: string; [key: string]: any };
interface GlissClient {
  connect(): Promise<void>;
  send(input: Record<string, unknown>): number;
  setAudioEnabled(enabled: boolean): Promise<void>;
  startProfiling?(
    options: GlissProfilingOptions,
  ): Promise<GlissProfilingHandle>;
  dispose(): void;
}
type GlissModule = {
  GlissClient: new (
    canvas: HTMLCanvasElement,
    onStatus: (status: string) => void,
    onEvent: (event: GlissEvent) => void,
    options: { url: string },
  ) => GlissClient;
};

/** Last gliss-server version seen, reused while the backend is unreachable. */
let glissVersion: string | undefined;

/**
 * Each gliss-server version serves its modules under its own URL. Ask for the
 * installed one before every session: the page keeps an imported module until
 * it reloads, so a fixed URL would pin the first client it loaded.
 */
async function importGlissClient(): Promise<GlissModule> {
  try {
    const response = await fetch(`${API_BASE_URL}/gliss/version`, {
      cache: "no-store",
    });
    if (response.ok) glissVersion = (await response.json()).version;
  } catch {
    // A reconnect keeps the last client and lets the tunnel report the outage.
  }
  if (!glissVersion) throw new Error("Failed to load the desktop client");
  return (await import(
    /* @vite-ignore */
    `${API_BASE_URL}/gliss/versions/${encodeURIComponent(glissVersion)}/client.js`
  )) as GlissModule;
}

/**
 * Identifies this browser to the backend, which lets only the first viewer of
 * a VM resize it. Reloads, new tabs and reconnects keep the same identity.
 */
function getViewerId(): string {
  let id = localStorage.getItem("desktop_viewer");
  if (!id) {
    id = Math.random().toString(36).slice(2);
    localStorage.setItem("desktop_viewer", id);
  }
  return id;
}

type UseGlissClientOptions =
  | {
      mode: "credential";
      credential: string;
      containerRef: RefObject<HTMLDivElement | null>;
      keyboardEnabled?: boolean;
    }
  | {
      mode: "vm";
      vmId: string;
      token: string;
      containerRef: RefObject<HTMLDivElement | null>;
      keyboardEnabled?: boolean;
    };

interface UseGlissClientResult {
  state: DesktopConnectionState;
  error?: string;
  clipboardText: string;
  sendClipboard: (text: string) => void;
  sendKeyEvent: (pressed: boolean, keysym: number) => void;
  audioAvailable: boolean;
  audioEnabled: boolean;
  audioMessage?: string;
  setAudioEnabled: (enabled: boolean) => void;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  isFullscreen: boolean;
  reconnect: () => void;
  startProfiling: StartProfiling;
}

export function useGlissClient(
  options: UseGlissClientOptions,
): UseGlissClientResult {
  const [state, setState] = useState<DesktopConnectionState>("connecting");
  const [error, setError] = useState<string | undefined>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [audioEnabled, setAudioEnabledState] = useState(false);
  const [audioMessage, setAudioMessage] = useState<string>();
  const audioRef = useRef<GlissClient | null>(null);
  const sendClipboardRef = useRef<((text: string) => void) | null>(null);
  const syncClipboardRef = useRef<(() => void) | null>(null);
  // Toolbar keys bypass the physical keyboard handling below.
  const sendRef = useRef<GlissClient["send"] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keyboardEnabledRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const everConnectedRef = useRef(false);
  const failedAttemptsRef = useRef(0);

  useEffect(() => {
    // The canvas takes keyboard input; dialogs move the focus away from it.
    keyboardEnabledRef.current = options.keyboardEnabled !== false;
    if (keyboardEnabledRef.current) {
      canvasRef.current?.focus();
      syncClipboardRef.current?.();
    }
  }, [options.keyboardEnabled]);

  const sendKeyEvent = useCallback((pressed: boolean, keysym: number) => {
    sendRef.current?.({ type: "key", keysym, down: pressed });
  }, []);

  const sendClipboard = useCallback((text: string) => {
    sendClipboardRef.current?.(text);
  }, []);

  // Share the existing client-control hook; profiling adds no effect or timer.
  const { setAudioEnabled, startProfiling } = useMemo(() => {
    const setAudioEnabled = (enabled: boolean) => {
      // Call directly from the button's click so playback has user activation.
      const client = audioRef.current;
      void client?.setAudioEnabled(enabled).catch(() => {
        if (audioRef.current !== client) return;
        setAudioEnabledState(false);
        setAudioMessage("Click Enable sound to allow audio playback.");
      });
    };
    const startProfiling: StartProfiling = async (options) => {
      const client = audioRef.current;
      if (!client?.startProfiling) return null;
      const handle = await client.startProfiling(options);
      if (audioRef.current !== client) {
        handle.stop();
        return null;
      }
      return handle;
    };
    return { setAudioEnabled, startProfiling };
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      if ("keyboard" in navigator && "unlock" in (navigator as any).keyboard) {
        (navigator as any).keyboard.unlock();
      }
    };
  }, []);

  const requestFullscreen = useCallback(async () => {
    // The container's parent also holds the toolbar overlay.
    const container = options.containerRef.current?.parentElement;
    if (!container) return;
    await container.requestFullscreen();
    if ("keyboard" in navigator && "lock" in (navigator as any).keyboard) {
      try {
        await (navigator as any).keyboard.lock([
          "MetaLeft",
          "MetaRight",
          "AltLeft",
          "AltRight",
          "Tab",
          "Escape",
        ]);
      } catch {}
    }
  }, [options.containerRef]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      if ("keyboard" in navigator && "unlock" in (navigator as any).keyboard) {
        (navigator as any).keyboard.unlock();
      }
      await document.exitFullscreen();
    }
  }, []);

  const reconnect = useCallback(() => {
    failedAttemptsRef.current = 0;
    setAttempt((n) => n + 1);
  }, []);

  const connectKey =
    options.mode === "credential" ? options.credential : options.vmId;

  useEffect(() => {
    if (!connectKey) return;
    setState(everConnectedRef.current ? "reconnecting" : "connecting");
    setError(undefined);
    setClipboardText("");
    setAudioAvailable(false);
    setAudioEnabledState(false);
    setAudioMessage(undefined);

    let cancelled = false;
    let client: GlissClient | undefined;
    let stopClipboardSync: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function initGliss() {
      const { GlissClient } = await importGlissClient();

      if (cancelled) return;

      const container = options.containerRef.current;
      if (!container) return;

      const canvas = document.createElement("canvas");
      canvas.tabIndex = 0;
      canvas.className = "max-h-full max-w-full outline-none";
      canvasRef.current = canvas;
      container.appendChild(canvas);

      // Ask the guest for the container size in CSS pixels. QEMU's VNC server
      // rounds widths up to a multiple of 16; H.264 needs even sizes up to
      // 3840x2160.
      const requestedSize = () => [
        Math.min(
          3840,
          Math.max(640, Math.floor(container.clientWidth / 16) * 16),
        ),
        Math.min(2160, Math.max(480, container.clientHeight & ~1)),
      ];
      let [w, h] = [0, 0];

      const connectParams =
        options.mode === "credential"
          ? `credential=${encodeURIComponent(options.credential)}&viewer=${getViewerId()}`
          : `vm_id=${encodeURIComponent(options.vmId)}&token=${encodeURIComponent(options.token)}&viewer=${getViewerId()}`;

      const clipboard = navigator.clipboard;
      let connected = false;
      let dropped = false;
      let hasVmInteraction = false;
      let lastClipboard: string | undefined;
      let lastError: string | undefined;
      let reading = false;
      let permission: PermissionStatus | undefined;
      let prompted = false;
      const queuedKeys: Record<string, unknown>[] = [];

      const sendClipboard = (text: string) => {
        lastClipboard = text;
        client!.send({ type: "clipboard", text });
      };
      sendClipboardRef.current = (text) => {
        sendClipboard(text);
        void clipboard?.writeText?.(text).catch(() => {});
      };

      const readSystemClipboard = async (requestPermission = false) => {
        if (
          cancelled ||
          !connected ||
          reading ||
          !clipboard?.readText ||
          !keyboardEnabledRef.current ||
          !document.hasFocus() ||
          (permission?.state !== "granted" &&
            !(requestPermission && permission?.state === "prompt" && !prompted))
        )
          return;
        prompted ||= permission?.state === "prompt";
        reading = true;
        const before = lastClipboard;
        try {
          // Bound the wait so an unanswered permission prompt cannot hang.
          const text = await Promise.race([
            clipboard.readText().catch(() => undefined),
            new Promise<undefined>((resolve) => setTimeout(resolve, 300)),
          ]);
          if (
            !cancelled &&
            connected &&
            document.hasFocus() &&
            keyboardEnabledRef.current &&
            lastClipboard === before &&
            text !== undefined &&
            text !== lastClipboard
          ) {
            sendClipboard(text);
          }
        } finally {
          reading = false;
          // Keys pressed during the read follow the new clipboard text.
          for (const key of queuedKeys.splice(0)) {
            if (!cancelled && connected) client!.send(key);
          }
        }
      };
      const syncClipboard = () => void readSystemClipboard();
      syncClipboardRef.current = syncClipboard;
      const enterDisplay = () => {
        hasVmInteraction = true;
        void readSystemClipboard(true);
      };
      void Promise.resolve()
        .then(() =>
          navigator.permissions?.query({
            name: "clipboard-read" as PermissionName,
          }),
        )
        .then((status) => {
          if (cancelled || !status) return;
          permission = status;
          permission.onchange = syncClipboard;
          syncClipboard();
        })
        .catch(() => {});

      const receiveClipboard = (text: string) => {
        const fromInteraction = hasVmInteraction;
        setClipboardText(text);
        if (text === lastClipboard) return;
        // Refresh from the system on entry after a guest replay or background copy.
        if (!connected || !fromInteraction || !document.hasFocus()) {
          lastClipboard = undefined;
          return;
        }
        lastClipboard = text;
        void clipboard?.writeText?.(text).catch(() => {});
      };

      window.addEventListener("focus", syncClipboard);
      canvas.addEventListener("pointerdown", enterDisplay, true);
      canvas.addEventListener("keydown", () => (hasVmInteraction = true));
      clipboard?.addEventListener("clipboardchange", syncClipboard);
      stopClipboardSync = () => {
        reading = false;
        queuedKeys.length = 0;
        window.removeEventListener("focus", syncClipboard);
        clipboard?.removeEventListener("clipboardchange", syncClipboard);
        if (permission) permission.onchange = null;
      };

      // Resize requests sent before the first paint would be dropped; the
      // first paint sends any change made while connecting.
      const requestResize = () => {
        const [width, height] = requestedSize();
        if (!connected || (width === w && height === h)) return;
        [w, h] = [width, height];
        client!.send({ type: "resize", width, height });
      };
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(requestResize, RESIZE_DEBOUNCE_MS);
      });
      resizeObserver.observe(container);

      const handleDrop = (message: string) => {
        if (cancelled || dropped) return;
        dropped = true;
        connected = false;
        setAudioEnabledState(false);
        setAudioAvailable(false);
        setError(message);
        if (!everConnectedRef.current) {
          setState("error");
          return;
        }
        const delay = RECONNECT_DELAYS_MS[failedAttemptsRef.current++];
        if (delay === undefined) {
          setState("disconnected");
          return;
        }
        setState("reconnecting");
        retryTimer = setTimeout(() => setAttempt((n) => n + 1), delay);
      };

      const showCursor = (event: GlissEvent) => {
        const { width, height, pixels } = event;
        if (!width || !height) {
          canvas.style.cursor = "none";
          return;
        }
        if (width > 128 || height > 128 || pixels.length !== width * height * 4)
          return;
        const image = document.createElement("canvas");
        image.width = width;
        image.height = height;
        image
          .getContext("2d")!
          .putImageData(
            new ImageData(new Uint8ClampedArray(pixels), width, height),
            0,
            0,
          );
        canvas.style.cursor = `url(${image.toDataURL()}) ${event.hotspot_x} ${event.hotspot_y}, default`;
      };

      client = new GlissClient(
        canvas,
        () => {},
        (event) => {
          if (cancelled) return;
          if (event.type === "frame" && !connected) {
            // The first painted frame shows the desktop.
            everConnectedRef.current = true;
            failedAttemptsRef.current = 0;
            connected = true;
            setState("connected");
            requestResize();
            syncClipboard();
          } else if (event.type === "clipboard") {
            receiveClipboard(event.text);
          } else if (event.type === "cursor") {
            showCursor(event);
          } else if (event.type === "audio_state") {
            setAudioAvailable(event.available === true);
            setAudioEnabledState(event.enabled === true);
            setAudioMessage(event.message);
          } else if (event.type === "error") {
            // Rejected input (input_error) does not end the session.
            lastError = event.message;
          } else if (event.type === "close") {
            handleDrop(
              event.reason || lastError || "Cannot connect to the VM desktop",
            );
          }
        },
        { url: `${TUNNEL_URL}?${connectParams}` },
      );
      audioRef.current = client;

      // Keys wait for a pending clipboard read so that a paste uses the new
      // text. Meta is Cmd on macOS, where users expect Cmd+C/V to act as Ctrl+C/V.
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const send = client.send.bind(client);
      sendRef.current = send;
      client.send = (input) => {
        if (input.type !== "key") return send(input);
        if (reading) {
          queuedKeys.push(input);
          return 0;
        }
        return send(
          isMac && (input.keysym === 0xffeb || input.keysym === 0xffec)
            ? { ...input, keysym: 0xffe3 }
            : input,
        );
      };

      await client.connect();
    }

    initGliss().catch((err: Error) => {
      if (!cancelled) {
        setState("error");
        setError(err?.message ?? "Failed to load the desktop client");
      }
    });

    return () => {
      cancelled = true;
      stopClipboardSync?.();
      sendClipboardRef.current = null;
      syncClipboardRef.current = null;
      clearTimeout(retryTimer);
      clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      sendRef.current = null;
      audioRef.current = null;
      canvasRef.current = null;
      client?.dispose();
      const container = options.containerRef.current;
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
  }, [connectKey, options.containerRef, attempt]);

  return {
    state,
    error,
    clipboardText,
    sendClipboard,
    sendKeyEvent,
    audioAvailable,
    audioEnabled,
    audioMessage,
    setAudioEnabled,
    requestFullscreen,
    exitFullscreen,
    isFullscreen,
    reconnect,
    startProfiling,
  };
}
