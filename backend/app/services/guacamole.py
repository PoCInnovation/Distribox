import asyncio
import logging

GUACAMOLE_PROTOCOL_VERSION = "1.5.5"
logger = logging.getLogger(__name__)


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

    # guacd 1.5.x may request protocol version negotiation via:
    # required,VERSION;
    # We must answer with:
    # client,1.5.0;
    # before proceeding, otherwise guacd closes the connection.
    while True:
        inst = await read_instruction(reader)
        opcode = inst[0] if inst else ""

        if opcode == "required":
            required_params = [param.upper() for param in inst[1:]]
            if "VERSION" in required_params:
                writer.write(
                    build_instruction("client", GUACAMOLE_PROTOCOL_VERSION).encode()
                )
                await writer.drain()
            continue

        if opcode != "args":
            raise RuntimeError(f"Unexpected guacd instruction before args: {inst!r}")

        required = inst[1:]
        protocol_marker = required[0] if required and required[0].upper().startswith("VERSION_") else None
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
        "encoding": "",
        "color-depth": "",
        "autoretry": "",
        "username": "",
        # Some guacd versions/plugins require protocol version as a connect arg.
        "version": GUACAMOLE_PROTOCOL_VERSION,
        "protocol-version": GUACAMOLE_PROTOCOL_VERSION,
    }

    def value_for_param(param_name: str) -> str:
        normalized = param_name.strip().lower()
        if param_name.strip().upper().startswith("VERSION_"):
            # For VERSION_1_5_0-style markers, guacd expects a dotted semantic
            # version string as the connect value (for example, "1.5.0").
            marker = param_name.strip().upper()[len("VERSION_"):]
            return marker.replace("_", ".")
        if normalized in param_map:
            return param_map[normalized]

        # guacd/plugin variants may use different version key spellings.
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
        any(k.strip().upper().startswith("VERSION_") or k.lower() == "version" for k in required),
    )
    writer.write(build_instruction(*connect_values).encode())
    await writer.drain()

    # Read the first post-connect instruction to validate the connection.
    first = await read_instruction(reader)
    if not first:
        raise RuntimeError("Empty response from guacd after connect")

    opcode = first[0]
    if opcode == "error":
        detail = first[1] if len(first) > 1 else "guacd connection error"
        raise RuntimeError(detail)

    # Return the first instruction (typically "ready") so callers can forward
    # it to the browser before continuing stream relay.
    return build_instruction(*first)
