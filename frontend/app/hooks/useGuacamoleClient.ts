import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type Guacamole from "guacamole-common-js";
import { TUNNEL_URL } from "~/lib/api";

export type GuacamoleConnectionState =
  "connecting" | "connected" | "error" | "disconnected";

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
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const requestFullscreen = useCallback(async () => {
    const container = options.containerRef.current;
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

  const connectKey =
    options.mode === "credential" ? options.credential : options.vmId;

  useEffect(() => {
    if (!connectKey) return;
    setState("connecting");
    setError(undefined);
    setClipboardText("");

    let cancelled = false;
    let client: Guacamole.Client | undefined;
    let keyboard: Guacamole.Keyboard | undefined;
    let stopClipboardSync: (() => void) | undefined;

    async function initGuacamole() {
      const { default: Guacamole } = await import("guacamole-common-js");

      if (cancelled) return;

      const container = options.containerRef.current;
      if (!container) return;

      const w = 1920;
      const h = 1080;

      let connectParams: string;
      if (options.mode === "credential") {
        connectParams = `credential=${encodeURIComponent(options.credential)}&width=${w}&height=${h}`;
      } else {
        connectParams = `vm_id=${encodeURIComponent(options.vmId)}&token=${encodeURIComponent(options.token)}&width=${w}&height=${h}`;
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
        prompted = true;
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
            if (!cancelled && (keyboardEnabledRef.current || !pressed)) {
              client!.sendKeyEvent(pressed, keysym);
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
        window.removeEventListener("focus", syncClipboard);
        displayEl.removeEventListener("pointerdown", enterDisplay, true);
        clipboard?.removeEventListener("clipboardchange", syncClipboard);
        if (permission) permission.onchange = null;
        queuedKeys.length = 0;
      };

      const mouse: Guacamole.Mouse = new Guacamole.Mouse(displayEl);
      display.showCursor(false);
      display.oncursor = (canvas, x, y) => {
        display.showCursor(!mouse.setCursor(canvas, x, y));
      };

      client.getDisplay().onresize = (newWidth: number, newHeight: number) => {
        const containerEl = options.containerRef.current;
        if (!containerEl) return;
        const scale = Math.min(
          containerEl.clientWidth / newWidth,
          containerEl.clientHeight / newHeight,
        );
        client!.getDisplay().scale(scale);
      };

      client.onrequired = () => {};

      client.onstatechange = (newState: number) => {
        connected = newState === 3;
        if (newState === 3) {
          setState("connected");
          syncClipboard();
        } else if (newState === 5) {
          setState("disconnected");
        }
      };

      client.onerror = (err: { message?: string }) => {
        setState("error");
        setError(err?.message ?? "Connection error");
      };

      tunnel.onerror = (err: { message?: string }) => {
        setState("error");
        setError(err?.message ?? "Tunnel error");
      };
      tunnel.onstatechange = (newState: number) => {
        if (newState === 0 || newState === 1 || newState === 3) return;
        if (newState === 2) {
          setState((prev) => (prev === "connected" ? "disconnected" : "error"));
          setError((prev) => prev ?? "Tunnel closed");
        }
      };

      const remapKeysym = (keysym: number): number => {
        if (keysym === 0xffe7) return 0xffeb;
        if (keysym === 0xffe8) return 0xffec;
        return keysym;
      };

      keyboard = new Guacamole.Keyboard(document);
      keyboardRef.current = keyboard;
      const sendKey = (pressed: 0 | 1, keysym: number) => {
        hasVmInteraction = true;
        if (reading) queuedKeys.push([pressed, remapKeysym(keysym)]);
        else client!.sendKeyEvent(pressed, remapKeysym(keysym));
      };
      keyboard.onkeydown = (keysym: number) => {
        if (!keyboardEnabledRef.current) return true;
        sendKey(1, keysym);
        return false;
      };
      keyboard.onkeyup = (keysym: number) => {
        if (!keyboardEnabledRef.current) return true;
        sendKey(0, keysym);
        return false;
      };

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
      clientRef.current = null;
      keyboard?.reset();
      if (keyboard) keyboard.onkeydown = keyboard.onkeyup = null;
      keyboardRef.current = null;
      if ("keyboard" in navigator && "unlock" in (navigator as any).keyboard) {
        (navigator as any).keyboard.unlock();
      }
      client?.disconnect();
      const container = options.containerRef.current;
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
  }, [connectKey, options.containerRef]);

  return {
    state,
    error,
    clipboardText,
    sendClipboard,
    sendKeyEvent,
    requestFullscreen,
    exitFullscreen,
    isFullscreen,
  };
}
