#!/usr/bin/env python3
"""Exercise real guacd <-> QEMU clipboard transport, without an existing VM.

Requires Docker, qemu-system-x86_64 and Python 3. Run after building:
  docker build -f backend/Dockerfile.guacd -t distribox-guacd-clipboard-test backend
  python backend/guacd/test_clipboard_transport.py

The second VNC client represents a QEMU clipboard peer. This tests the actual
VNC/Guacamole protocol path, not a browser or the desktop's spice-vdagent.
"""

import argparse
import asyncio
import base64
import json
import socket
import struct
import subprocess
import tempfile
import uuid
import zlib


TEXT = 1
CAPS = 1 << 24
REQUEST = 1 << 25
NOTIFY = 1 << 27
PROVIDE = 1 << 28
EXTENDED_CLIPBOARD = 0xC0A1E5CE
TIMEOUT = 10


def unused_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def connect(port):
    for _ in range(100):
        try:
            return await asyncio.open_connection("127.0.0.1", port)
        except OSError:
            await asyncio.sleep(0.05)
    raise RuntimeError(f"Listener did not start on port {port}")


class ClipboardPeer:
    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer
        self.contents = b""
        self.received = asyncio.Queue()

    async def initialize(self):
        version = await self.reader.readexactly(12)
        assert version.startswith(b"RFB "), version
        self.writer.write(b"RFB 003.008\n")
        count = (await self.reader.readexactly(1))[0]
        security = await self.reader.readexactly(count)
        assert 1 in security, "Throwaway QEMU should allow unauthenticated VNC"
        self.writer.write(b"\x01")
        assert await self.reader.readexactly(4) == b"\0\0\0\0"
        self.writer.write(b"\x01")  # Share the QEMU display with guacd.
        info = await self.reader.readexactly(24)
        await self.reader.readexactly(struct.unpack(">I", info[-4:])[0])
        self.writer.write(struct.pack(">BBHI", 2, 0, 1, EXTENDED_CLIPBOARD))
        await self.writer.drain()

    def send(self, flags, data=b""):
        payload = struct.pack(">I", flags) + data
        self.writer.write(struct.pack(">B3xi", 6, -len(payload)) + payload)

    def provide(self):
        text = self.contents + b"\0"
        self.send(PROVIDE | TEXT, zlib.compress(struct.pack(">I", len(text)) + text))

    async def offer(self, text):
        self.contents = text.encode()
        self.send(NOTIFY | TEXT)
        self.provide()
        await self.writer.drain()

    async def read(self):
        while True:
            header = await self.reader.readexactly(8)
            assert header[0] == 3, "Unexpected VNC message without framebuffer requests"
            length = struct.unpack(">i", header[4:])[0]
            data = await self.reader.readexactly(abs(length))
            if length >= 0:
                await self.received.put(data.decode())
                continue
            flags = struct.unpack(">I", data[:4])[0]
            if flags & CAPS:
                continue
            if flags & NOTIFY and flags & TEXT:
                self.send(REQUEST | TEXT)
            elif flags & REQUEST:
                self.provide()
            elif flags & PROVIDE:
                unpacked = zlib.decompress(data[4:])
                size = struct.unpack(">I", unpacked[:4])[0]
                await self.received.put(unpacked[4:4 + size].rstrip(b"\0").decode())
            await self.writer.drain()


class GuacamolePeer:
    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer
        self.streams = {}
        self.received = asyncio.Queue()
        self.ready = asyncio.Event()
        self.connected = asyncio.Event()

    def send(self, *parts):
        self.writer.write((",".join(f"{len(str(p))}.{p}" for p in parts) + ";").encode())

    async def instruction(self):
        parts = []
        while True:
            length = int((await self.reader.readuntil(b"."))[:-1])
            parts.append((await self.reader.readexactly(length)).decode())
            if await self.reader.readexactly(1) == b";":
                return parts

    async def initialize(self, vnc_port):
        self.send("select", "vnc")
        args = await self.instruction()
        assert args[0] == "args", args
        settings = {"hostname": "127.0.0.1", "port": str(vnc_port),
                    "clipboard-encoding": "UTF-8", "disable-display-resize": "true"}
        values = [key[8:].replace("_", ".") if key.startswith("VERSION_")
                  else settings.get(key, "") for key in args[1:]]
        self.send("size", 640, 480, 96)
        self.send("audio")
        self.send("video")
        self.send("image", "image/png")
        self.send("connect", *values)
        await self.writer.drain()

    async def offer(self, text):
        self.send("clipboard", 0, "text/plain")
        self.send("blob", 0, base64.b64encode(text.encode()).decode())
        self.send("end", 0)
        await self.writer.drain()

    async def read(self):
        while True:
            op, *args = await self.instruction()
            if op == "ready":
                self.ready.set()
            elif op == "sync":
                self.connected.set()
                self.send("sync", args[0])
            elif op == "clipboard":
                self.streams[args[0]] = bytearray()
            elif op == "blob" and args[0] in self.streams:
                self.streams[args[0]].extend(base64.b64decode(args[1]))
                self.send("ack", args[0], "OK", 0)
            elif op == "end" and args[0] in self.streams:
                await self.received.put(self.streams.pop(args[0]).decode())
            elif op == "error":
                raise RuntimeError(f"guacd: {args}")
            await self.writer.drain()


class ClassicVNCServer:
    """A classic-only server checks fallback without advertising UTF-8 support."""

    def __init__(self):
        self.received = asyncio.Queue()
        self.writer = None
        self.task = None

    async def read(self, reader, writer):
        self.writer, self.task = writer, asyncio.current_task()
        writer.write(b"RFB 003.008\n")
        await reader.readexactly(12)
        writer.write(b"\x01\x01")
        await reader.readexactly(1)
        writer.write(b"\0\0\0\0")
        await reader.readexactly(1)
        pixel_format = struct.pack(">BBBBHHHBBB3x", 32, 24, 0, 1, 255, 255, 255, 16, 8, 0)
        writer.write(struct.pack(">HH", 1, 1) + pixel_format + struct.pack(">I", 4) + b"test")
        await writer.drain()
        frame_sent = False
        while True:
            op = (await reader.readexactly(1))[0]
            if op == 0:
                await reader.readexactly(19)
            elif op == 2:
                header = await reader.readexactly(3)
                await reader.readexactly(4 * struct.unpack(">H", header[1:])[0])
            elif op == 3:
                await reader.readexactly(9)
                # Deliver one black pixel so guacd can finish its first frame.
                if not frame_sent:
                    writer.write(struct.pack(">BBHHHHHi", 0, 0, 1, 0, 0, 1, 1, 0) + b"\0\0\0\0")
                    frame_sent = True
            elif op == 6:
                header = await reader.readexactly(7)
                length = struct.unpack(">i", header[3:])[0]
                assert length >= 0, "Extended Clipboard sent without server support"
                await self.received.put((await reader.readexactly(length)).decode())
            else:
                raise AssertionError(f"Unexpected classic VNC client message {op}")
            await writer.drain()

    async def offer(self, text):
        data = text.encode()
        self.writer.write(struct.pack(">B3xI", 3, len(data)) + data)
        await self.writer.drain()


async def expect(queue, expected):
    async def matching():
        while True:
            received = await queue.get()
            if received == expected:
                return
            raise AssertionError(f"Clipboard changed: expected {expected!r}, got {received!r}")
    await asyncio.wait_for(matching(), TIMEOUT)


async def run(image):
    vnc_port, guacd_port = unused_port(), unused_port()
    container = "distribox-clipboard-test-" + uuid.uuid4().hex[:12]
    tasks, peers, servers, results = [], [], [], {}
    with tempfile.TemporaryFile() as logs:
        qemu = subprocess.Popen(["qemu-system-x86_64", "-machine", "q35,accel=tcg",
                                 "-name", container,
                                 "-m", "64", "-nodefaults", "-device", "VGA",
                                 "-display", "none", "-monitor", "none", "-serial", "none",
                                 "-vnc", f"127.0.0.1:{vnc_port - 5900}"],
                                stdout=logs, stderr=logs)
        try:
            subprocess.run(["docker", "run", "--detach", "--name", container,
                            "--network", "host", "--entrypoint", "/opt/guacamole/sbin/guacd",
                            image, "-f", "-b", "127.0.0.1", "-l", str(guacd_port)],
                           check=True, stdout=subprocess.DEVNULL)
            vnc = ClipboardPeer(*await connect(vnc_port))
            peers.append(vnc)
            await vnc.initialize()
            tasks.append(asyncio.create_task(vnc.read()))
            guac = GuacamolePeer(*await connect(guacd_port))
            peers.append(guac)
            await guac.initialize(vnc_port)
            tasks.append(asyncio.create_task(guac.read()))
            await asyncio.wait_for(guac.ready.wait(), TIMEOUT)
            await asyncio.wait_for(guac.connected.wait(), TIMEOUT)
            # Allow VNC capability exchange to finish before offering data.
            await asyncio.sleep(0.1)
            for direction, sender, receiver, text in [
                ("guacamole_to_qemu", guac, vnc, "From host: café, 日本語\nsecond line"),
                ("qemu_to_guacamole", vnc, guac, "From VM: déjà vu, 🐧\nsecond line"),
                ("empty_guacamole_to_qemu", guac, vnc, ""),
                ("empty_qemu_to_guacamole", vnc, guac, ""),
            ]:
                await sender.offer(text)
                try:
                    await expect(receiver.received, text)
                    results[direction] = "passed"
                except (TimeoutError, AssertionError) as exc:
                    results[direction] = str(exc) or "timed out"
            classic = ClassicVNCServer()
            server = await asyncio.start_server(classic.read, "127.0.0.1", 0)
            servers.append(server)
            fallback = GuacamolePeer(*await connect(guacd_port))
            peers.append(fallback)
            await fallback.initialize(server.sockets[0].getsockname()[1])
            tasks.append(asyncio.create_task(fallback.read()))
            await asyncio.wait_for(fallback.connected.wait(), TIMEOUT)
            tasks.append(classic.task)
            peers.append(classic)
            for direction, sender, receiver, text in [
                ("classic_guacamole_to_vnc", fallback, classic, "Classic: café\nsecond line"),
                ("classic_vnc_to_guacamole", classic, fallback, "Classic return: déjà vu"),
            ]:
                await sender.offer(text)
                await expect(receiver.received, text)
                results[direction] = "passed"
            for task in tasks:
                if task.done():
                    task.result()
        finally:
            for server in servers:
                server.close()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            for peer in peers:
                peer.writer.close()
            for server in servers:
                await server.wait_closed()
            subprocess.run(["docker", "rm", "--force", container],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            qemu.terminate()
            try:
                qemu.wait(timeout=5)
            except subprocess.TimeoutExpired:
                qemu.kill()
                qemu.wait()
    print(json.dumps({"image": image, "checks": results}, indent=2))
    return all(value == "passed" for value in results.values())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="distribox-guacd-clipboard-test")
    arguments = parser.parse_args()
    raise SystemExit(0 if asyncio.run(run(arguments.image)) else 1)
