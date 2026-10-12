import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type Guacamole from "guacamole-common-js";
import { TUNNEL_URL } from "~/lib/api";

export type GuacamoleConnectionState =
  "connecting" | "connected" | "reconnecting" | "error" | "disconnected";

/** Delays before each automatic reconnect attempt after a dropped session. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000, 10000, 10000];

/** Time to let the window settle before asking the guest to resize. */
const RESIZE_DEBOUNCE_MS = 250;

/**
 * Identifies this browser to the backend, which lets only the first viewer of
 * a VM resize it. Reloads, new tabs and reconnects keep the same identity.
 */
function getViewerId(): string {
  let id = localStorage.getItem("guacamole_viewer");
  if (!id) {
    id = Math.random().toString(36).slice(2);
    localStorage.setItem("guacamole_viewer", id);
  }
  return id;
}

type UseGuacamoleClientOptions =
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

interface UseGuacamoleClientResult {
  state: GuacamoleConnectionState;
  error?: string;
  clipboardText: string;
  sendClipboard: (text: string) => void;
  sendKeyEvent: (pressed: boolean, keysym: number) => void;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  isFullscreen: boolean;
  reconnect: () => void;
}

export function useGuacamoleClient(
  options: UseGuacamoleClientOptions,
): UseGuacamoleClientResult {
  const [state, setState] = useState<GuacamoleConnectionState>("connecting");
  const [error, setError] = useState<string | undefined>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  const sendClipboardRef = useRef<((text: string) => void) | null>(null);
  const syncClipboardRef = useRef<(() => void) | null>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const keyboardRef = useRef<Guacamole.Keyboard | null>(null);
  const keyboardEnabledRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const everConnectedRef = useRef(false);
  const failedAttemptsRef = useRef(0);
  // Keys held when a session drops stay down in the guest until released.
  const staleKeysRef = useRef(new Set<number>());

  useEffect(() => {
    if (options.keyboardEnabled === false) keyboardRef.current?.reset();
    keyboardEnabledRef.current = options.keyboardEnabled !== false;
    if (keyboardEnabledRef.current) syncClipboardRef.current?.();
  }, [options.keyboardEnabled]);

  const sendKeyEvent = useCallback((pressed: boolean, keysym: number) => {
    clientRef.current?.sendKeyEvent(pressed ? 1 : 0, keysym);
  }, []);

  const sendClipboard = useCallback((text: string) => {
    sendClipboardRef.current?.(text);
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

    let cancelled = false;
    let client: Guacamole.Client | undefined;
    let keyboard: Guacamole.Keyboard | undefined;
    let stopClipboardSync: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Remote keysym -> local keysyms holding it (Cmd and Control both send
    // Control_L on macOS): it is released once none of them is held.
    const heldBy = new Map<number, Set<number>>();
    const releaseKeys = () => keyboard?.reset();
    const dropHorizontalScroll = (e: WheelEvent) => {
      // Guacamole.Mouse turns horizontal wheel events into vertical scrolls.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    async function initGuacamole() {
      const { default: Guacamole } = await import("guacamole-common-js");

      if (cancelled) return;

      const container = options.containerRef.current;
      if (!container) return;

      // Ask the guest for the container size in CSS pixels. QEMU's VNC server
      // rounds widths up to a multiple of 16 and caps the size at 5120x2160.
      const requestedSize = () => [
        Math.min(
          5120,
          Math.max(640, Math.floor(container.clientWidth / 16) * 16),
        ),
        Math.min(2160, Math.max(480, container.clientHeight)),
      ];
      let [w, h] = requestedSize();

      let connectParams: string;
      if (options.mode === "credential") {
        connectParams = `credential=${encodeURIComponent(options.credential)}&width=${w}&height=${h}&viewer=${getViewerId()}`;
      } else {
        connectParams = `vm_id=${encodeURIComponent(options.vmId)}&token=${encodeURIComponent(options.token)}&width=${w}&height=${h}&viewer=${getViewerId()}`;
      }

      const tunnel = new Guacamole.WebSocketTunnel(TUNNEL_URL);
      client = new Guacamole.Client(tunnel);
      clientRef.current = client;

      const clipboard = navigator.clipboard;
      let connected = false;
      let hasVmInteraction = false;
      let lastClipboard: string | undefined;
      let reading = false;
      let permission: PermissionStatus | undefined;
      let prompted = false;
      const queuedKeys: [0 | 1, number][] = [];

      const sendClipboard = (text: string) => {
        lastClipboard = text;
        const writer = new Guacamole.ArrayBufferWriter(
          client!.createClipboardStream("text/plain"),
        );
        writer.sendData(new TextEncoder().encode(text));
        writer.sendEnd();
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
          // Bound the wait so an unanswered permission prompt cannot freeze keys.
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
          for (const [pressed, keysym] of queuedKeys.splice(0)) {
            if (
              !cancelled &&
              connected &&
              ((keyboardEnabledRef.current && document.hasFocus()) || !pressed)
            ) {
              sendKey(!!pressed, keysym);
            }
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

      client.onclipboard = (stream, mimetype) => {
        if (!mimetype.startsWith("text/plain")) return;
        const fromInteraction = hasVmInteraction;
        const reader = new Guacamole.ArrayBufferReader(stream);
        const decoder = new TextDecoder();
        let text = "";
        reader.ondata = (chunk) => {
          text += decoder.decode(chunk, { stream: true });
        };
        reader.onend = () => {
          if (cancelled) return;
          text += decoder.decode();
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
      };

      const display = client.getDisplay();
      const displayEl = display.getElement();
      container.appendChild(displayEl);

      window.addEventListener("focus", syncClipboard);
      displayEl.addEventListener("pointerdown", enterDisplay, true);
      clipboard?.addEventListener("clipboardchange", syncClipboard);
      stopClipboardSync = () => {
        reading = false;
        for (const [pressed, keysym] of queuedKeys.splice(0)) {
          if (!pressed) sendKey(false, keysym);
        }
        window.removeEventListener("focus", syncClipboard);
        displayEl.removeEventListener("pointerdown", enterDisplay, true);
        clipboard?.removeEventListener("clipboardchange", syncClipboard);
        if (permission) permission.onchange = null;
      };

      const mouse: Guacamole.Mouse = new Guacamole.Mouse(displayEl);
      display.showCursor(false);
      display.oncursor = (canvas, x, y) => {
        display.showCursor(!mouse.setCursor(canvas, x, y));
      };

      // A desktop at the requested size is shown 1:1. On HiDPI screens,
      // integer scales use nearest-neighbour so that text stays crisp.
      const fit = () => {
        const width = display.getWidth();
        const height = display.getHeight();
        if (!width || !height) return;
        const scale = Math.min(
          container.clientWidth / width,
          container.clientHeight / height,
        );
        const devicePixels = scale * window.devicePixelRatio;
        display.scale(scale);
        displayEl.style.imageRendering =
          Number.isInteger(devicePixels) && devicePixels >= 2
            ? "pixelated"
            : "";
      };
      // Resize requests sent before the first paint would be dropped; the
      // first paint sends any change made while connecting.
      const requestResize = () => {
        const [width, height] = requestedSize();
        if (!painted || (width === w && height === h)) return;
        [w, h] = [width, height];
        client!.sendSize(w, h);
      };
      display.onresize = fit;
      resizeObserver = new ResizeObserver(() => {
        fit();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(requestResize, RESIZE_DEBOUNCE_MS);
      });
      resizeObserver.observe(container);

      client.onrequired = () => {};

      // The first frames only carry the cursor: report the session as connected
      // once a frame that draws on the desktop layer (0) has been painted.
      let desktopDrawn = false;
      let painted = false;
      let dropped = false;
      const handleInstruction = tunnel.oninstruction;
      tunnel.oninstruction = (opcode, args) => {
        if (opcode === "img") desktopDrawn ||= args[2] === "0";
        if (opcode === "cfill") desktopDrawn ||= args[1] === "0";
        handleInstruction?.(opcode, args);
      };
      client.onsync = () => {
        if (painted || !desktopDrawn) return;
        painted = true;
        display.flush(() => {
          if (cancelled || dropped) return;
          for (const keysym of staleKeysRef.current) {
            if (!heldBy.get(keysym)?.size) client!.sendKeyEvent(0, keysym);
          }
          staleKeysRef.current.clear();
          requestResize();
          everConnectedRef.current = true;
          failedAttemptsRef.current = 0;
          connected = true;
          setState("connected");
          syncClipboard();
        });
      };

      const handleDrop = (message: string) => {
        if (cancelled || dropped) return;
        dropped = true;
        connected = false;
        queuedKeys.length = 0;
        for (const [keysym, sources] of heldBy) {
          if (sources.size) staleKeysRef.current.add(keysym);
        }
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

      client.onstatechange = (newState: number) => {
        if (newState === 5) handleDrop("Disconnected");
      };
      client.onerror = (err: { message?: string }) =>
        handleDrop(err?.message ?? "Connection error");
      tunnel.onerror = (err: { message?: string }) =>
        handleDrop(err?.message ?? "Tunnel error");
      tunnel.onstatechange = (newState: number) => {
        if (newState === 2) handleDrop("Connection closed");
      };

      // Meta is Cmd on macOS, where users expect Cmd+C/V to act as Ctrl+C/V.
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const remapKeysym = (keysym: number): number => {
        if (keysym === 0xffe7) return isMac ? 0xffe3 : 0xffeb;
        if (keysym === 0xffe8) return isMac ? 0xffe3 : 0xffec;
        return keysym;
      };
      const sendKey = (pressed: boolean, keysym: number) => {
        const remote = remapKeysym(keysym);
        const sources = heldBy.get(remote) ?? new Set<number>();
        const wasHeld = sources.size > 0;
        if (pressed) sources.add(keysym);
        else sources.delete(keysym);
        heldBy.set(remote, sources);
        if (pressed ? !wasHeld : wasHeld && !sources.size) {
          client!.sendKeyEvent(pressed ? 1 : 0, remote);
        }
      };

      const sendKeyboardKey = (pressed: boolean, keysym: number) => {
        if (dropped) return;
        hasVmInteraction = true;
        if (reading) queuedKeys.push([pressed ? 1 : 0, keysym]);
        else sendKey(pressed, keysym);
      };

      keyboard = new Guacamole.Keyboard(document);
      keyboardRef.current = keyboard;
      keyboard.onkeydown = (keysym: number) => {
        if (!keyboardEnabledRef.current) return true;
        sendKeyboardKey(true, keysym);
        return false;
      };
      keyboard.onkeyup = (keysym: number) => {
        if (!keyboardEnabledRef.current) return true;
        sendKeyboardKey(false, keysym);
        return false;
      };
      window.addEventListener("blur", releaseKeys);
      container.addEventListener("wheel", dropHorizontalScroll, {
        capture: true,
        passive: false,
      });

      const sendMouse = (mouseState: Guacamole.Mouse.State) =>
        client!.sendMouseState(mouseState, true);
      mouse.onmousedown = sendMouse;
      mouse.onmouseup = sendMouse;
      mouse.onmousemove = sendMouse;

      client.connect(connectParams);
    }

    initGuacamole().catch((err: Error) => {
      if (!cancelled) {
        setState("error");
        setError(err?.message ?? "Failed to load Guacamole client");
      }
    });

    return () => {
      cancelled = true;
      stopClipboardSync?.();
      sendClipboardRef.current = null;
      syncClipboardRef.current = null;
      if (client) client.onclipboard = null;
      clearTimeout(retryTimer);
      clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("blur", releaseKeys);
      options.containerRef.current?.removeEventListener(
        "wheel",
        dropHorizontalScroll,
        { capture: true },
      );
      clientRef.current = null;
      // Keyboards cannot detach from the document: release the keys, then
      // remove the handlers so that this one ignores all further events.
      if (keyboard) {
        keyboard.reset();
        keyboard.onkeydown = keyboard.onkeyup = null;
      }
      keyboardRef.current = null;
      client?.disconnect();
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
    requestFullscreen,
    exitFullscreen,
    isFullscreen,
    reconnect,
  };
}
