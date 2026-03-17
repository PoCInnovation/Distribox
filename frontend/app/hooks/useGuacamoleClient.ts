import { useEffect, useState } from "react";
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
}

export function useGuacamoleClient(
  options: UseGuacamoleClientOptions,
): UseGuacamoleClientResult {
  const [state, setState] = useState<GuacamoleConnectionState>("connecting");
  const [error, setError] = useState<string | undefined>();

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
        // guacamole-common-js state: 3 = CONNECTED, 5 = DISCONNECTED
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

      // Keyboard
      keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (keysym: number) => client!.sendKeyEvent(1, keysym);
      keyboard.onkeyup = (keysym: number) => client!.sendKeyEvent(0, keysym);

      // Mouse
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
      keyboard?.reset();
      client?.disconnect();
      const container = options.containerRef.current;
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
  }, [connectKey, options.containerRef]);

  return { state, error };
}
