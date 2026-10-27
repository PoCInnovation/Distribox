import asyncio
import contextlib
import functools
import secrets
import shutil
import socket
import subprocess
import sysconfig
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import httpx


def gliss_binary() -> str:
    """The gliss-server executable installed by backend/requirements.txt."""
    installed = Path(sysconfig.get_path("scripts")) / "gliss-server"
    if installed.is_file():
        return str(installed)
    return shutil.which("gliss-server") or str(installed)


@functools.cache
def web_dir() -> Path:
    """Browser modules embedded in the installed gliss-server, exported once."""
    directory = Path(tempfile.mkdtemp(prefix="gliss-web-"))
    subprocess.run([gliss_binary(), "--export-web",
                   str(directory)], check=True)
    return directory


@contextlib.asynccontextmanager
async def gliss_session(vnc_host: str, vnc_port: int) -> AsyncIterator[tuple[str, dict[str, str]]]:
    """Run a private gliss-server for one VNC display.

    Yields the server's WebSocket URL and the headers that authenticate it.
    """
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    token = secrets.token_urlsafe(32)
    process = await asyncio.create_subprocess_exec(
        gliss_binary(), "--vnc", f"{vnc_host}:{vnc_port}",
        "--bind", f"127.0.0.1:{port}", "--max-clients", "1",
        # H.264 keeps motion within a typical upload link, where lossless
        # updates queue for seconds; several frames in flight keep it smooth
        # on high-latency links.
        "--codec", "h264", "--h264-bitrate", "2000000", "--fps", "30",
        "--in-flight-frames", "4",
        env={"GLISS_TOKEN": token}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
    )
    try:
        async with httpx.AsyncClient(base_url=origin) as client:
            for _ in range(100):
                if process.returncode is not None:
                    raise RuntimeError(
                        "The desktop stream stopped while starting")
                try:
                    response = await client.post(
                        "/api/session", json={"token": token}, headers={"Origin": origin})
                    break
                except httpx.TransportError:
                    await asyncio.sleep(0.05)
            else:
                raise RuntimeError("The desktop stream did not start")
            response.raise_for_status()
            cookie = response.headers["set-cookie"].split(";", 1)[0]
        yield f"ws://127.0.0.1:{port}/ws", {"Cookie": cookie, "Origin": origin}
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), 5)
            except TimeoutError:
                process.kill()
                await process.wait()
