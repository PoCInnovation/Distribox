declare module "guacamole-common-js" {
  namespace Guacamole {
    class WebSocketTunnel {
      constructor(url: string);
      onerror: ((error: { message?: string }) => void) | null;
    }

    class Display {
      getElement(): HTMLElement;
      scale(scale: number): void;
    }

    class Client {
      constructor(tunnel: WebSocketTunnel);
      getDisplay(): Display;
      connect(params?: string): void;
      disconnect(): void;
      sendKeyEvent(pressed: 0 | 1, keysym: number): void;
      sendMouseState(mouseState: Mouse.State): void;
      onstatechange: ((state: number) => void) | null;
      onerror: ((error: { message?: string }) => void) | null;
    }

    class Keyboard {
      constructor(element: Document | HTMLElement);
      onkeydown: ((keysym: number) => void) | null;
      onkeyup: ((keysym: number) => void) | null;
      reset(): void;
    }

    class Mouse {
      constructor(element: HTMLElement);
      onmousedown: ((state: Mouse.State) => void) | null;
      onmouseup: ((state: Mouse.State) => void) | null;
      onmousemove: ((state: Mouse.State) => void) | null;
    }

    namespace Mouse {
      class State {
        x: number;
        y: number;
        left: boolean;
        middle: boolean;
        right: boolean;
        up: boolean;
        down: boolean;
      }
    }
  }

  export default Guacamole;
}
