declare module "guacamole-common-js" {
  namespace Guacamole {
    class WebSocketTunnel {
      constructor(url: string);
      onerror: ((error: { message?: string }) => void) | null;
      onstatechange: ((state: number) => void) | null;
      sendMessage(...elements: string[]): void;
    }

    class Display {
      getElement(): HTMLElement;
      scale(scale: number): void;
      showCursor(shown: boolean): void;
      oncursor:
        ((canvas: HTMLCanvasElement, x: number, y: number) => void) | null;
      onresize: ((width: number, height: number) => void) | null;
    }

    class Client {
      constructor(tunnel: WebSocketTunnel);
      getDisplay(): Display;
      connect(params?: string): void;
      disconnect(): void;
      sendKeyEvent(pressed: 0 | 1, keysym: number): void;
      sendMouseState(
        mouseState: Mouse.State,
        applyDisplayScale?: boolean,
      ): void;
      onstatechange: ((state: number) => void) | null;
      onerror: ((error: { message?: string }) => void) | null;
      onrequired: ((required: string[]) => void) | null;
      onclipboard: ((stream: InputStream, mimetype: string) => void) | null;
      createClipboardStream(mimetype: string): OutputStream;
    }

    class InputStream {
      sendAck(message: string, code: number): void;
    }

    class OutputStream {}

    class StringReader {
      constructor(stream: InputStream);
      ontext: ((text: string) => void) | null;
      onend: (() => void) | null;
    }

    class StringWriter {
      constructor(stream: OutputStream);
      sendText(text: string): void;
      sendEnd(): void;
    }

    class Keyboard {
      constructor(element: Document | HTMLElement);
      onkeydown: ((keysym: number) => void) | null;
      onkeyup: ((keysym: number) => void) | null;
      reset(): void;
      pressed: Record<number, boolean>;
    }

    class Mouse {
      constructor(element: HTMLElement);
      onmousedown: ((state: Mouse.State) => void) | null;
      onmouseup: ((state: Mouse.State) => void) | null;
      onmousemove: ((state: Mouse.State) => void) | null;
      setCursor(canvas: HTMLCanvasElement, x: number, y: number): boolean;
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
