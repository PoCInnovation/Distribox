from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import gliss


@pytest.fixture
def launch(monkeypatch):
    for name in (
        "GLISS_PROFILING", "GLISS_FPS", "GLISS_H264_BITRATE", "GLISS_IN_FLIGHT_FRAMES",
    ):
        monkeypatch.delenv(name, raising=False)
    socket = MagicMock()
    socket.return_value.__enter__.return_value.getsockname.return_value = (
        "127.0.0.1", 12345)
    monkeypatch.setattr(gliss, "socket", SimpleNamespace(socket=socket))
    process = MagicMock(returncode=None)
    process.wait = AsyncMock()
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(gliss.asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(gliss, "gliss_binary", lambda: "gliss-server")
    monkeypatch.setattr(gliss.secrets, "token_urlsafe", lambda _: "test-token")
    response = SimpleNamespace(
        headers={"set-cookie": "gliss_session=test; HttpOnly"},
        raise_for_status=lambda: None,
    )
    client = MagicMock()
    client.__aenter__.return_value.post = AsyncMock(return_value=response)
    monkeypatch.setattr(gliss.httpx, "AsyncClient", lambda **_: client)
    return spawn, socket, process


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [None, "false", "true"])
@pytest.mark.parametrize("configured", [False, True])
async def test_profiling_changes_only_the_stream_stats_flag(
    monkeypatch, launch, value, configured,
):
    spawn, _, process = launch
    if value is not None:
        monkeypatch.setenv("GLISS_PROFILING", value)
    if configured:
        monkeypatch.setenv("GLISS_FPS", "24")
        monkeypatch.setenv("GLISS_H264_BITRATE", "1500000")
        monkeypatch.setenv("GLISS_IN_FLIGHT_FRAMES", "6")

    async with gliss.gliss_session("vnc-target", 5907) as (url, headers):
        assert url == "ws://127.0.0.1:12345/ws"
        assert headers == {
            "Cookie": "gliss_session=test", "Origin": "http://127.0.0.1:12345"}

    expected = [
        "gliss-server", "--vnc", "vnc-target:5907",
        "--bind", "127.0.0.1:12345", "--max-clients", "1",
        "--codec", "h264", "--h264-bitrate", "1500000" if configured else "2000000",
        "--fps", "24" if configured else "30",
        "--in-flight-frames", "6" if configured else "8",
    ]
    if value == "true":
        expected.append("--stream-stats")
    spawn.assert_awaited_once_with(
        *expected, env={"GLISS_TOKEN": "test-token"},
        stdin=gliss.subprocess.DEVNULL, stdout=gliss.subprocess.DEVNULL,
    )
    process.terminate.assert_called_once()
    process.wait.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["", "1", "0", "True", "FALSE", " true ", "enabled"])
async def test_invalid_profiling_is_rejected_before_port_reservation(
    monkeypatch, launch, value,
):
    spawn, socket, _ = launch
    monkeypatch.setenv("GLISS_PROFILING", value)

    with pytest.raises(ValueError, match="GLISS_PROFILING must be true or false"):
        async with gliss.gliss_session("vnc-target", 5907):
            pytest.fail("Invalid profiling must not start a worker")

    socket.assert_not_called()
    spawn.assert_not_awaited()
