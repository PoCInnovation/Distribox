import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type Guacamole from "guacamole-common-js";
import { API_BASE_URL } from "~/lib/api";

export type GuacamoleConnectionState =
  | "connecting"
  | "connected"
  | "error"
  | "disconnected";

type UseGuacamoleClientOptions =
  | {
      mode: "credential";
      credential: string;
      containerRef: RefObject<HTMLDivElement | null>;
    }
  | {
      mode: "vm";
      vmId: string;
      token: string;
      containerRef: RefObject<HTMLDivElement | null>;
    };

interface UseGuacamoleClientResult {
  state: GuacamoleConnectionState;
  error?: string;
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
  const clientRef = useRef<Guacamole.Client | null>(null);

  const sendKeyEvent = useCallback((pressed: boolean, keysym: number) => {
    clientRef.current?.sendKeyEvent(pressed ? 1 : 0, keysym);
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

    let cancelled = false;
    let client: Guacamole.Client | undefined;
    let keyboard: Guacamole.Keyboard | undefined;

    async function initGuacamole() {
      const { default: Guacamole } = await import("guacamole-common-js");

      if (cancelled) return;

      const container = options.containerRef.current;
      if (!container) return;

      const w = 1920;
      const h = 1080;

      const tunnelUrl = `${API_BASE_URL.replace(/^http/, "ws")}/tunnel`;

      let connectParams: string;
      if (options.mode === "credential") {
        connectParams = `credential=${encodeURIComponent(options.credential)}&width=${w}&height=${h}`;
      } else {
        connectParams = `vm_id=${encodeURIComponent(options.vmId)}&token=${encodeURIComponent(options.token)}&width=${w}&height=${h}`;
      }

      const tunnel = new Guacamole.WebSocketTunnel(tunnelUrl);
      client = new Guacamole.Client(tunnel);
      clientRef.current = client;

      const display = client.getDisplay();

      const killCursor = () => {
        display.showCursor(false);
        const cursorEl = display.getElement().querySelector(".cursor");
        if (cursorEl) (cursorEl as HTMLElement).style.display = "none";
      };
      killCursor();
      display.oncursor = killCursor;

      const displayEl = display.getElement();
      container.appendChild(displayEl);

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
        if (newState === 3) {
          killCursor();
          setState("connected");
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
      keyboard.onkeydown = (keysym: number) => {
        client!.sendKeyEvent(1, remapKeysym(keysym));
        return false;
      };
      keyboard.onkeyup = (keysym: number) => {
        client!.sendKeyEvent(0, remapKeysym(keysym));
        return false;
      };

      const mouse: Guacamole.Mouse = new Guacamole.Mouse(displayEl);
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
      clientRef.current = null;
      keyboard?.reset();
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
    sendKeyEvent,
    requestFullscreen,
    exitFullscreen,
    isFullscreen,
  };
}
