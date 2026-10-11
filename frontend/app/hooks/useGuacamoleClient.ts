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
  sendClipboard: (text: string) => boolean;
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
  const sendClipboardRef = useRef<((text: string) => boolean) | null>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const keyboardRef = useRef<Guacamole.Keyboard | null>(null);
  const keyboardEnabledRef = useRef(true);

  useEffect(() => {
    if (options.keyboardEnabled === false) keyboardRef.current?.reset();
    keyboardEnabledRef.current = options.keyboardEnabled !== false;
  }, [options.keyboardEnabled]);

  const sendKeyEvent = useCallback((pressed: boolean, keysym: number) => {
    clientRef.current?.sendKeyEvent(pressed ? 1 : 0, keysym);
  }, []);

  const sendClipboard = useCallback(
    (text: string) => sendClipboardRef.current?.(text) ?? false,
    [],
  );

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
    let connected = false;
    let clipboardRevision = 0;
    let focusRequest = 0;
    let manualPastePending = false;
    let client: Guacamole.Client | undefined;
    let keyboard: Guacamole.Keyboard | undefined;
    let removeClipboardListeners: (() => void) | undefined;

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

      const writeClipboard = (text: string) => {
        if (cancelled || !connected) return false;
        clipboardRevision++;
        const writer = new Guacamole.StringWriter(
          client!.createClipboardStream("text/plain"),
        );
        writer.sendText(text);
        writer.sendEnd();
        return true;
      };
      sendClipboardRef.current = (text) => {
        const sent = writeClipboard(text);
        if (sent) manualPastePending = true;
        return sent;
      };

      client.onclipboard = (stream, mimetype) => {
        if (!/^text\/plain(?:;.*)?$/i.test(mimetype)) {
          stream.sendAck("Only text clipboard data is supported", 0x0100);
          return;
        }
        const reader = new Guacamole.StringReader(stream);
        const revision = ++clipboardRevision;
        let text = "";
        reader.ontext = (chunk) => {
          text += chunk;
          stream.sendAck("OK", 0x0000);
        };
        reader.onend = () => {
          if (cancelled || !connected || revision !== clipboardRevision) return;
          clipboardRevision++;
          setClipboardText(text);
          // Retain the text for manual copying if the browser denies access.
          if (keyboardEnabledRef.current && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(text).catch(() => {});
          }
        };
        stream.sendAck("OK", 0x0000);
      };

      const display = client.getDisplay();
      const displayEl = display.getElement();
      container.appendChild(displayEl);

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
        } else if (newState === 5) {
          setState("disconnected");
        }
      };

      client.onerror = (err: { message?: string }) => {
        connected = false;
        setState("error");
        setError(err?.message ?? "Connection error");
      };

      tunnel.onerror = (err: { message?: string }) => {
        connected = false;
        setState("error");
        setError(err?.message ?? "Tunnel error");
      };
      tunnel.onstatechange = (newState: number) => {
        if (newState === 0 || newState === 1 || newState === 3) return;
        if (newState === 2) {
          connected = false;
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
      const editingText = () =>
        !!document.activeElement?.closest(
          "input, textarea, select, [contenteditable='true']",
        );
      const ctrlPressed = () =>
        keyboard!.pressed[0xffe3] || keyboard!.pressed[0xffe4];
      const shiftPressed = () =>
        keyboard!.pressed[0xffe1] || keyboard!.pressed[0xffe2];
      const metaPressed = () =>
        [0xffe7, 0xffe8, 0xffeb, 0xffec].some(
          (keysym) => keyboard!.pressed[keysym],
        );
      let pasteKeysym: number | undefined;
      keyboard.onkeydown = (keysym: number) => {
        if (!keyboardEnabledRef.current || editingText()) return true;
        if (
          (keysym === 0x76 || keysym === 0x56) &&
          !keyboard!.pressed[0xffe9] &&
          !keyboard!.pressed[0xffea] &&
          !!ctrlPressed() !== metaPressed()
        ) {
          // Allow the browser paste event to supply text without read permission.
          pasteKeysym = keysym;
          return true;
        }
        client!.sendKeyEvent(1, remapKeysym(keysym));
        return false;
      };
      keyboard.onkeyup = (keysym: number) => {
        if (keysym === pasteKeysym) {
          pasteKeysym = undefined;
          return true;
        }
        if (!keyboardEnabledRef.current || editingText()) return true;
        client!.sendKeyEvent(0, remapKeysym(keysym));
        return false;
      };

      const handlePaste = (event: ClipboardEvent) => {
        if (!connected || !keyboardEnabledRef.current || editingText()) return;
        if (manualPastePending) {
          // The next paste uses the draft explicitly sent from the dialog.
          manualPastePending = false;
          clipboardRevision++;
        } else {
          if (!event.clipboardData?.types.includes("text/plain")) return;
          if (!writeClipboard(event.clipboardData.getData("text/plain")))
            return;
        }
        event.preventDefault();
        // Clipboard instructions precede the shortcut in the same tunnel.
        const ctrl = !!ctrlPressed();
        const shift = !!shiftPressed();
        const metaKeys = [0xffe7, 0xffe8, 0xffeb, 0xffec]
          .filter((keysym) => keyboard!.pressed[keysym])
          .map(remapKeysym);
        for (const keysym of metaKeys) client!.sendKeyEvent(0, keysym);
        if (!ctrl) client!.sendKeyEvent(1, 0xffe3);
        client!.sendKeyEvent(1, shift ? 0x56 : 0x76);
        client!.sendKeyEvent(0, shift ? 0x56 : 0x76);
        if (!ctrl) client!.sendKeyEvent(0, 0xffe3);
        for (const keysym of metaKeys) client!.sendKeyEvent(1, keysym);
      };
      const syncClipboard = async () => {
        if (
          !keyboardEnabledRef.current ||
          manualPastePending ||
          !navigator.clipboard?.readText
        )
          return;
        const revision = clipboardRevision;
        const request = ++focusRequest;
        try {
          const text = await navigator.clipboard.readText();
          if (
            keyboardEnabledRef.current &&
            revision === clipboardRevision &&
            request === focusRequest
          ) {
            writeClipboard(text);
          }
        } catch {
          // Native paste and the Clipboard dialog work without read permission.
        }
      };
      const handleBlur = () => {
        manualPastePending = false;
        focusRequest++;
      };
      document.addEventListener("paste", handlePaste);
      window.addEventListener("focus", syncClipboard);
      window.addEventListener("blur", handleBlur);
      removeClipboardListeners = () => {
        document.removeEventListener("paste", handlePaste);
        window.removeEventListener("focus", syncClipboard);
        window.removeEventListener("blur", handleBlur);
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
      connected = false;
      removeClipboardListeners?.();
      sendClipboardRef.current = null;
      if (client) client.onclipboard = null;
      clientRef.current = null;
      keyboard?.reset();
      if (keyboard) {
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
      }
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
