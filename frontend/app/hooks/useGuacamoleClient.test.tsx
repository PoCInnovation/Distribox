// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuacamoleClient } from "./useGuacamoleClient";

interface InputStream {
  sendAck: ReturnType<typeof vi.fn>;
}

interface Reader {
  stream: InputStream;
  ontext: ((text: string) => void) | null;
  onend: (() => void) | null;
}

const guacamole = vi.hoisted(() => {
  const clients: Client[] = [];
  const keyboards: Keyboard[] = [];
  const readers: Reader[] = [];
  const protocol: unknown[][] = [];

  class Client {
    onstatechange: ((state: number) => void) | null = null;
    onerror: ((error: { message?: string }) => void) | null = null;
    onrequired: (() => void) | null = null;
    onclipboard: ((stream: InputStream, mimetype: string) => void) | null =
      null;
    element = document.createElement("div");
    display = {
      getElement: () => this.element,
      showCursor: vi.fn(),
      scale: vi.fn(),
      oncursor: null,
      onresize: null,
    };
    connect = vi.fn();
    disconnect = vi.fn();
    sendMouseState = vi.fn();
    sendKeyEvent = vi.fn((pressed: number, keysym: number) => {
      protocol.push(["key", pressed, keysym]);
    });
    createClipboardStream = vi.fn((mimetype: string) => {
      const stream = {};
      protocol.push(["clipboard", mimetype]);
      return stream;
    });

    constructor() {
      clients.push(this);
    }

    getDisplay() {
      return this.display;
    }
  }

  class Keyboard {
    pressed: Record<number, boolean> = {};
    onkeydown: ((keysym: number) => boolean) | null = null;
    onkeyup: ((keysym: number) => boolean) | null = null;
    reset = vi.fn(() => {
      this.pressed = {};
    });

    constructor() {
      keyboards.push(this);
    }

    press(keysym: number) {
      this.pressed[keysym] = true;
      return this.onkeydown?.(keysym);
    }

    release(keysym: number) {
      delete this.pressed[keysym];
      return this.onkeyup?.(keysym);
    }
  }

  class StringReader {
    ontext: ((text: string) => void) | null = null;
    onend: (() => void) | null = null;

    constructor(public stream: InputStream) {
      readers.push(this);
    }
  }

  class StringWriter {
    sendText(text: string) {
      protocol.push(["text", text]);
    }

    sendEnd() {
      protocol.push(["end"]);
    }
  }

  return {
    clients,
    keyboards,
    readers,
    protocol,
    module: {
      Client,
      Keyboard,
      StringReader,
      StringWriter,
      WebSocketTunnel: class {},
      Mouse: class {
        setCursor = vi.fn(() => true);
      },
      Status: { Code: { UNSUPPORTED: 0x100 } },
    },
  };
});

vi.mock("guacamole-common-js", () => ({ default: guacamole.module }));
vi.mock("~/lib/api", () => ({ TUNNEL_URL: "ws://localhost/test-tunnel" }));

const readText = vi.fn<() => Promise<string>>();
const writeText = vi.fn<(text: string) => Promise<void>>();
let container: HTMLDivElement;

beforeEach(() => {
  guacamole.clients.length = 0;
  guacamole.keyboards.length = 0;
  guacamole.readers.length = 0;
  guacamole.protocol.length = 0;
  readText.mockReset().mockResolvedValue("");
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText, writeText },
  });
  container = document.createElement("div");
  container.tabIndex = 0;
  document.body.appendChild(container);
});

afterEach(() => {
  cleanup();
  container.remove();
  vi.restoreAllMocks();
});

async function connect(keyboardEnabled = true) {
  const containerRef = { current: container };
  const hook = renderHook(
    ({ credential, keyboardEnabled }) =>
      useGuacamoleClient({
        mode: "credential",
        credential,
        containerRef,
        keyboardEnabled,
      }),
    { initialProps: { credential: "first-session", keyboardEnabled } },
  );
  await waitFor(() => expect(guacamole.clients).toHaveLength(1));
  const client = guacamole.clients[0];
  act(() => client.onstatechange?.(3));
  return { ...hook, client, keyboard: guacamole.keyboards[0], containerRef };
}

function receiveClipboard(
  client: (typeof guacamole.clients)[number],
  text: string,
) {
  const stream = { sendAck: vi.fn() };
  act(() => client.onclipboard?.(stream, "text/plain"));
  const reader = guacamole.readers.at(-1)!;
  act(() => {
    reader.ontext?.(text);
    reader.onend?.();
  });
  return reader;
}

function paste(text: string, target: EventTarget = container) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      types: ["text/plain"],
      getData: (mimetype: string) => (mimetype === "text/plain" ? text : ""),
    },
  });
  act(() => target.dispatchEvent(event));
  return event;
}

describe("VM clipboard sharing", () => {
  it("collects guest text chunks and copies the completed clipboard to the system", async () => {
    const { result, client } = await connect();
    const stream = { sendAck: vi.fn() };

    expect(client.onclipboard).toBeTypeOf("function");
    act(() => client.onclipboard?.(stream, "text/plain"));
    const reader = guacamole.readers[0];
    act(() => {
      reader.ontext?.("hello ");
      reader.ontext?.("from the VM");
    });
    expect(writeText).not.toHaveBeenCalled();

    await act(async () => reader.onend?.());
    expect(result.current.clipboardText).toBe("hello from the VM");
    expect(writeText).toHaveBeenCalledWith("hello from the VM");
  });

  it("keeps guest text available when system clipboard permission is denied", async () => {
    writeText.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const { result, client } = await connect();

    receiveClipboard(client, "manual copy remains available");

    await waitFor(() =>
      expect(result.current.clipboardText).toBe(
        "manual copy remains available",
      ),
    );
    expect(result.current.state).toBe("connected");
  });

  it("keeps guest text available without the browser clipboard API", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const { result, client } = await connect();

    receiveClipboard(client, "remote text");

    expect(result.current.clipboardText).toBe("remote text");
    expect(result.current.state).toBe("connected");
  });

  it("rejects non-text guest streams", async () => {
    const { result, client } = await connect();
    const stream = { sendAck: vi.fn() };

    act(() => client.onclipboard?.(stream, "image/png"));

    expect(stream.sendAck).toHaveBeenCalledWith(expect.any(String), 0x100);
    expect(guacamole.readers).toHaveLength(0);
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.clipboardText).toBe("");
  });

  it("sends text and ends the guest clipboard stream synchronously", async () => {
    const { result } = await connect();

    expect(result.current.sendClipboard("paste this\nΩ")).toBe(true);
    expect(guacamole.protocol).toEqual([
      ["clipboard", "text/plain"],
      ["text", "paste this\nΩ"],
      ["end"],
    ]);
  });

  it("does not open clipboard streams before connection or after disconnect", async () => {
    const { result, client } = await connect();
    act(() => client.onstatechange?.(1));
    expect(result.current.sendClipboard("still connecting")).toBe(false);
    act(() => client.onstatechange?.(3));
    act(() => client.onstatechange?.(5));

    expect(result.current.sendClipboard("disconnected")).toBe(false);
    expect(client.createClipboardStream).not.toHaveBeenCalled();
  });

  it("copies the system clipboard into the VM when the window regains focus", async () => {
    readText.mockResolvedValue("host text");
    const { client } = await connect();

    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(client.createClipboardStream).toHaveBeenCalledWith("text/plain");
    expect(guacamole.protocol).toEqual([
      ["clipboard", "text/plain"],
      ["text", "host text"],
      ["end"],
    ]);
  });

  it("keeps the session usable when reading the system clipboard is denied", async () => {
    readText.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const { result, client } = await connect();

    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(result.current.state).toBe("connected");
    expect(client.createClipboardStream).not.toHaveBeenCalled();
    expect(result.current.sendClipboard("manual paste")).toBe(true);
  });

  it("transfers native paste text before sending the guest paste shortcut", async () => {
    await connect();

    const event = paste("native paste");

    expect(event.defaultPrevented).toBe(true);
    expect(guacamole.protocol.slice(0, 3)).toEqual([
      ["clipboard", "text/plain"],
      ["text", "native paste"],
      ["end"],
    ]);
    const keyEvents = guacamole.protocol.slice(3);
    expect(keyEvents).toContainEqual(["key", 1, 0xffe3]);
    expect(keyEvents).toContainEqual(["key", 1, 0x76]);
    expect(keyEvents).toContainEqual(["key", 0, 0x76]);
  });

  it.each([0xffe3, 0xffe4, 0xffe7, 0xffe8, 0xffeb, 0xffec])(
    "lets the browser receive the paste shortcut with modifier %s",
    async (modifier) => {
      const { keyboard, client } = await connect();
      keyboard.press(modifier);
      client.sendKeyEvent.mockClear();

      expect(keyboard.press(0x76)).toBe(true);
      expect(keyboard.release(0x76)).toBe(true);
      expect(client.sendKeyEvent).not.toHaveBeenCalledWith(1, 0x76);
      expect(client.sendKeyEvent).not.toHaveBeenCalledWith(0, 0x76);

      paste("shortcut paste");
      const clipboardEnd = guacamole.protocol.findIndex(
        (operation) => operation[0] === "end",
      );
      const pasteKeyDown = guacamole.protocol.findIndex(
        (operation) =>
          operation[0] === "key" && operation[1] === 1 && operation[2] === 0x76,
      );
      expect(clipboardEnd).toBeGreaterThanOrEqual(0);
      expect(pasteKeyDown).toBeGreaterThan(clipboardEnd);
      const guestPressedKeys = new Set<number>();
      for (const [operation, pressed, keysym] of guacamole.protocol.slice(
        0,
        pasteKeyDown + 1,
      )) {
        if (operation !== "key") continue;
        if (pressed) guestPressedKeys.add(Number(keysym));
        else guestPressedKeys.delete(Number(keysym));
      }
      expect(guestPressedKeys.has(0xffe3) || guestPressedKeys.has(0xffe4)).toBe(
        true,
      );
      expect(guestPressedKeys).not.toContain(0xffeb);
      expect(guestPressedKeys).not.toContain(0xffec);
      const modifierAfterPaste =
        modifier === 0xffe7 ? 0xffeb : modifier === 0xffe8 ? 0xffec : modifier;
      for (const [operation, pressed, keysym] of guacamole.protocol.slice(
        pasteKeyDown + 1,
      )) {
        if (operation !== "key") continue;
        if (pressed) guestPressedKeys.add(Number(keysym));
        else guestPressedKeys.delete(Number(keysym));
      }
      expect(guestPressedKeys).toEqual(new Set([modifierAfterPaste]));
    },
  );

  it("preserves Ctrl+Shift+V for terminal paste", async () => {
    const { keyboard } = await connect();
    keyboard.press(0xffe3);
    keyboard.press(0xffe1);

    expect(keyboard.press(0x56)).toBe(true);
    paste("terminal paste");
    expect(keyboard.release(0x56)).toBe(true);

    const clipboardEnd = guacamole.protocol.findIndex(
      (operation) => operation[0] === "end",
    );
    const keyEvents = guacamole.protocol.slice(clipboardEnd + 1);
    expect(keyEvents).toContainEqual(["key", 1, 0x56]);
    expect(guacamole.protocol).toContainEqual(["key", 1, 0xffe1]);
  });

  it("ignores automatic clipboard input while a modal disables the keyboard", async () => {
    const { client, keyboard } = await connect(false);

    await act(async () => window.dispatchEvent(new Event("focus")));
    const event = paste("modal text");
    keyboard.press(0x76);

    expect(readText).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(client.createClipboardStream).not.toHaveBeenCalled();
    expect(client.sendKeyEvent).not.toHaveBeenCalled();
  });

  it("discards a pending focus read when a modal disables the keyboard", async () => {
    let resolveRead!: (text: string) => void;
    readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { rerender, client } = await connect();
    act(() => window.dispatchEvent(new Event("focus")));
    rerender({ credential: "first-session", keyboardEnabled: false });

    await act(async () => resolveRead("clipboard before modal"));

    expect(client.createClipboardStream).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea"])(
    "leaves local %s paste and typing with the browser",
    async (tag) => {
      const { client, keyboard } = await connect();
      const input = document.createElement(tag);
      document.body.appendChild(input);
      input.focus();

      const event = paste("local text", input);
      expect(keyboard.press(0x61)).toBe(true);
      expect(keyboard.release(0x61)).toBe(true);

      expect(event.defaultPrevented).toBe(false);
      expect(client.createClipboardStream).not.toHaveBeenCalled();
      expect(client.sendKeyEvent).not.toHaveBeenCalled();
      input.remove();
    },
  );

  it("clears guest clipboard text when switching credentials", async () => {
    const { result, rerender, client } = await connect();
    receiveClipboard(client, "first VM clipboard");
    expect(result.current.clipboardText).toBe("first VM clipboard");

    rerender({ credential: "second-session", keyboardEnabled: true });
    await waitFor(() => expect(guacamole.clients).toHaveLength(2));

    expect(result.current.clipboardText).toBe("");
    expect(client.disconnect).toHaveBeenCalled();
    expect(result.current.sendClipboard("connecting next VM")).toBe(false);
  });

  it("ignores a completed guest stream from a previous credential", async () => {
    const { result, rerender, client } = await connect();
    act(() => client.onclipboard?.({ sendAck: vi.fn() }, "text/plain"));
    const oldReader = guacamole.readers[0];
    act(() => oldReader.ontext?.("stale guest clipboard"));
    rerender({ credential: "second-session", keyboardEnabled: true });
    await waitFor(() => expect(guacamole.clients).toHaveLength(2));

    await act(async () => oldReader.onend?.());

    expect(result.current.clipboardText).toBe("");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("discards a pending system clipboard read after credential switching", async () => {
    let resolveRead!: (text: string) => void;
    readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result, rerender } = await connect();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(readText).toHaveBeenCalledTimes(1);
    rerender({ credential: "second-session", keyboardEnabled: true });
    await waitFor(() => expect(guacamole.clients).toHaveLength(2));
    act(() => guacamole.clients[1].onstatechange?.(3));

    await act(async () => resolveRead("clipboard read for previous VM"));

    expect(result.current.state).toBe("connected");
    expect(guacamole.protocol).toEqual([]);
  });

  it("does not overwrite a newer guest copy with a pending focus clipboard read", async () => {
    let resolveRead!: (text: string) => void;
    readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result, client } = await connect();
    act(() => window.dispatchEvent(new Event("focus")));
    receiveClipboard(client, "new guest text");

    await act(async () => resolveRead("old system text"));

    expect(result.current.clipboardText).toBe("new guest text");
    expect(client.createClipboardStream).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("new guest text");
  });

  it("does not overwrite native paste text with a pending focus clipboard read", async () => {
    let resolveRead!: (text: string) => void;
    readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { client } = await connect();
    act(() => window.dispatchEvent(new Event("focus")));
    paste("new native paste");

    await act(async () => resolveRead("old system text"));

    expect(client.createClipboardStream).toHaveBeenCalledTimes(1);
    expect(guacamole.protocol).toContainEqual(["text", "new native paste"]);
    expect(guacamole.protocol).not.toContainEqual(["text", "old system text"]);
  });

  it("keeps the newest guest clipboard when earlier streams finish later", async () => {
    const { result, client } = await connect();
    act(() => client.onclipboard?.({ sendAck: vi.fn() }, "text/plain"));
    const earlierReader = guacamole.readers[0];
    act(() => earlierReader.ontext?.("older guest clipboard"));
    receiveClipboard(client, "newer guest clipboard");

    await act(async () => earlierReader.onend?.());

    expect(result.current.clipboardText).toBe("newer guest clipboard");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("newer guest clipboard");
  });

  it("removes clipboard event handlers and ignores pending reads after unmount", async () => {
    let resolveRead!: (text: string) => void;
    readText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { unmount, client } = await connect();
    act(() => window.dispatchEvent(new Event("focus")));
    unmount();

    await act(async () => resolveRead("late clipboard"));
    const event = paste("after unmount");
    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(readText).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(client.createClipboardStream).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("pastes the manually sent draft without replacing it with the system clipboard", async () => {
    const { result, client } = await connect();
    act(() => result.current.sendClipboard("manual draft"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    paste("old system clipboard");

    expect(client.createClipboardStream).toHaveBeenCalledTimes(1);
    expect(guacamole.protocol).toContainEqual(["text", "manual draft"]);
    expect(guacamole.protocol).not.toContainEqual([
      "text",
      "old system clipboard",
    ]);
    expect(guacamole.protocol).toContainEqual(["key", 1, 0x76]);
    expect(readText).not.toHaveBeenCalled();
    paste("next system clipboard");
    expect(guacamole.protocol).toContainEqual([
      "text",
      "next system clipboard",
    ]);
  });

  it("uses a new system clipboard after leaving a manually prepared VM", async () => {
    const { result } = await connect();
    act(() => result.current.sendClipboard("manual draft"));
    act(() => window.dispatchEvent(new Event("blur")));
    paste("copied elsewhere");

    expect(guacamole.protocol).toContainEqual(["text", "copied elsewhere"]);
  });

  it.each(["native", "manual"])(
    "discards an older guest stream after a newer %s send",
    async (method) => {
      const { result, client } = await connect();
      act(() => client.onclipboard?.({ sendAck: vi.fn() }, "text/plain"));
      const reader = guacamole.readers[0];
      act(() => reader.ontext?.("old guest text"));
      if (method === "native") paste("new system text");
      else act(() => result.current.sendClipboard("new system text"));
      await act(async () => reader.onend?.());

      expect(result.current.clipboardText).toBe("");
      expect(writeText).not.toHaveBeenCalled();
    },
  );

  it("forwards Ctrl+Alt+V to the guest as a custom shortcut", async () => {
    const { keyboard, client } = await connect();
    keyboard.press(0xffe3);
    keyboard.press(0xffe9);
    expect(keyboard.press(0x76)).toBe(false);
    keyboard.release(0x76);

    expect(client.sendKeyEvent).toHaveBeenCalledWith(1, 0x76);
    expect(client.sendKeyEvent).toHaveBeenCalledWith(0, 0x76);
  });
});
