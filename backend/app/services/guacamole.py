import asyncio
import logging

GUACAMOLE_PROTOCOL_VERSION = "1.5.0"
logger = logging.getLogger(__name__)


def build_instruction(*args: str) -> str:
    return ",".join(f"{len(a)}.{a}" for a in args) + ";"


async def read_instruction(reader: asyncio.StreamReader) -> list[str]:
    """Read one Guacamole instruction using length-prefix parsing.

    Each element is ``<len>.<data>`` separated by ``,`` and terminated by ``;``.
    We must parse by length-prefix rather than scanning for ``;`` because
    element data (e.g. guacd log messages) can contain literal semicolons.
    """
    elements: list[str] = []
    try:
        while True:
            length_buf = bytearray()
            while True:
                byte = await reader.readexactly(1)
                if byte == b".":
                    break
                length_buf.extend(byte)
            n = int(length_buf.decode())
            data = await reader.readexactly(n)
            elements.append(data.decode())
            sep = await reader.readexactly(1)
            if sep == b";":
                break
    except asyncio.IncompleteReadError:
        raise ConnectionError("guacd closed connection")
    return elements


async def guacd_handshake(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    vnc_host: str,
    vnc_port: int,
    width: int = 1920,
    height: int = 1080,
) -> str:
    """Perform the Guacamole VNC handshake with guacd up to and including
    the `connect` instruction.

    The `ready` response is intentionally left in the TCP stream so that the
    relay can forward it to the browser. The browser's Guacamole.Client
    transitions to CONNECTED state only upon receiving `ready` — consuming
    it here would leave the client permanently stuck in the WAITING state.
    """
    writer.write(build_instruction("select", "vnc").encode())
    await writer.drain()

    # client,1.5.0
    while True:
        inst = await read_instruction(reader)
        opcode = inst[0] if inst else ""

        if opcode == "required":
            required_params = [param.upper() for param in inst[1:]]
            if "VERSION" in required_params:
                writer.write(
                    build_instruction(
                        "client", GUACAMOLE_PROTOCOL_VERSION).encode()
                )
                await writer.drain()
            continue

        if opcode != "args":
            raise RuntimeError(
                f"Unexpected guacd instruction before args: {inst!r}")

        required = inst[1:]
        protocol_marker = required[0] if required and required[0].upper(
        ).startswith("VERSION_") else None
        logger.warning(
            "guacd args protocol_marker=%s required=%s",
            protocol_marker,
            required,
        )
        break

    param_map = {
        "hostname": vnc_host,
        "host": vnc_host,
        "port": str(vnc_port),
        "dest-host": "",
        "dest-port": "",
        "password": "",
        "swap-red-blue": "false",
        "read-only": "false",
        "cursor": "remote",
        "encoding": "tight zrle copyrect hextile",
        "color-depth": "24",
        "autoretry": "",
        "username": "",
        "server-layout": "",
        "version": GUACAMOLE_PROTOCOL_VERSION,
        "protocol-version": GUACAMOLE_PROTOCOL_VERSION,
    }

    def value_for_param(param_name: str) -> str:
        normalized = param_name.strip().lower()
        if param_name.strip().upper().startswith("VERSION_"):
            marker = param_name.strip().upper()[len("VERSION_"):]
            return marker.replace("_", ".")
        if normalized in param_map:
            return param_map[normalized]

        if "version" in normalized:
            return GUACAMOLE_PROTOCOL_VERSION

        return ""

    param_pairs = [(k, value_for_param(k)) for k in required]
    connect_values = [
        "connect",
        *[value for _, value in param_pairs],
    ]
    logger.warning(
        "guacd connect params=%s version_arg_present=%s",
        param_pairs,
        any(k.strip().upper().startswith("VERSION_") or
            k.lower() == "version" for k in required),
    )

    # The Guacamole protocol requires size, audio, video, and image
    # capability instructions BEFORE connect. Without these, guacd's
    # child process has no display dimensions and exits immediately.
    writer.write(build_instruction(
        "size", str(width), str(height), "96").encode())
    await writer.drain()
    writer.write(build_instruction("audio").encode())
    await writer.drain()
    writer.write(build_instruction("video").encode())
    await writer.drain()
    writer.write(build_instruction("image", "image/png",
                 "image/jpeg", "image/webp").encode())
    await writer.drain()

    writer.write(build_instruction(*connect_values).encode())
    await writer.drain()

    first = await read_instruction(reader)
    if not first:
        raise RuntimeError("Empty response from guacd after connect")

    opcode = first[0]
    if opcode == "error":
        detail = first[1] if len(first) > 1 else "guacd connection error"
        raise RuntimeError(detail)

    return build_instruction(*first)
