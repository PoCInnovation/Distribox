import asyncio


def build_instruction(*args: str) -> str:
    return ",".join(f"{len(a)}.{a}" for a in args) + ";"


async def read_instruction(reader: asyncio.StreamReader) -> list[str]:
    """Read one complete Guacamole instruction (ends with ';') and parse it."""
    buf = bytearray()
    while True:
        byte = await reader.read(1)
        if not byte:
            raise ConnectionError("guacd closed connection")
        buf.extend(byte)
        if byte == b";":
            break
    raw = buf.decode().rstrip(";")
    elements: list[str] = []
    idx = 0
    while idx < len(raw):
        dot = raw.index(".", idx)
        n = int(raw[idx:dot])
        elements.append(raw[dot + 1: dot + 1 + n])
        idx = dot + 1 + n + 1  # skip trailing comma
    return elements


async def guacd_handshake(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    vnc_host: str,
    vnc_port: int,
) -> None:
    """Perform the Guacamole VNC handshake with guacd up to and including
    the `connect` instruction.

    The `ready` response is intentionally left in the TCP stream so that the
    relay can forward it to the browser. The browser's Guacamole.Client
    transitions to CONNECTED state only upon receiving `ready` — consuming
    it here would leave the client permanently stuck in the WAITING state.
    """
    writer.write(build_instruction("select", "vnc").encode())
    await writer.drain()

    args_inst = await read_instruction(reader)  # ["args", "hostname", "port", ...]
    required = args_inst[1:]

    param_map = {
        "hostname": vnc_host,
        "port": str(vnc_port),
        "password": "",
        "swap-red-blue": "false",
        "read-only": "false",
        "cursor": "remote",
        "encoding": "",
        "color-depth": "",
        "autoretry": "",
        "username": "",
    }
    connect_values = ["connect"] + [param_map.get(k, "") for k in required]
    writer.write(build_instruction(*connect_values).encode())
    await writer.drain()
    # `ready` is left in the stream — the relay forwards it to the browser.
