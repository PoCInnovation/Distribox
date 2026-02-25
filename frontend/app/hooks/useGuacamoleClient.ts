import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type Guacamole from "guacamole-common-js";

export type GuacamoleConnectionState =
  | "connecting"
  | "connected"
  | "error"
  | "disconnected";

interface UseGuacamoleClientOptions {
  credential: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

interface UseGuacamoleClientResult {
  state: GuacamoleConnectionState;
  error?: string;
}

export function useGuacamoleClient({
  credential,
  containerRef,
}: UseGuacamoleClientOptions): UseGuacamoleClientResult {
  const [state, setState] = useState<GuacamoleConnectionState>("connecting");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!credential) return;
    setState("connecting");
    setError(undefined);

    let cancelled = false;
    let client: Guacamole.Client | undefined;
    let keyboard: Guacamole.Keyboard | undefined;

    async function initGuacamole() {
      // Dynamic import prevents SSR breakage. The package uses `export default
      // Guacamole`, so we pull `.default` from the module namespace object.
      const { default: Guacamole } = await import("guacamole-common-js");

      if (cancelled) return;

      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth || 1024;
      const h = container.clientHeight || 768;

      const wsBase = (import.meta.env.VITE_API_DOMAIN as string).replace(
        /^http/,
        "ws",
      );
      // Pass only the base path to WebSocketTunnel — the library appends
      // "?" + connectParams itself inside connect(), so query params must
      // NOT be in the tunnel URL or the URL ends up with a double "?".
      const tunnelUrl = `${wsBase}/tunnel`;
      const connectParams = `credential=${encodeURIComponent(credential)}&width=${w}&height=${h}`;

      const tunnel = new Guacamole.WebSocketTunnel(tunnelUrl);
      client = new Guacamole.Client(tunnel);

      const displayEl = client.getDisplay().getElement();
      container.appendChild(displayEl);

      // Scale display to fill container
      const scale = Math.min(w / 1024, h / 768);
      client.getDisplay().scale(scale);

      // Keep hook for potential future required-parameter UI handling.
      // This client should not emit low-level protocol opcodes directly.
      client.onrequired = () => {};

      client.onstatechange = (newState: number) => {
        // guacamole-common-js state: 3 = CONNECTED, 5 = DISCONNECTED
        if (newState === 3) {
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
        // guacamole-common-js tunnel states: 0=CONNECTING, 1=OPEN, 2=CLOSED, 3=UNSTABLE
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
        client!.sendMouseState(mouseState);
      mouse.onmousedown = sendMouse;
      mouse.onmouseup = sendMouse;
      mouse.onmousemove = sendMouse;

      // connectParams are appended as "?connectParams" by WebSocketTunnel
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
      const container = containerRef.current;
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
  }, [credential, containerRef]);

  return { state, error };
}
