"""Measure the desktop relay without VMs, encoding, TLS, or browser rendering.

Run from the repository root with the backend requirements installed:
    AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py

Each relay hop runs in its own process. CPU and RSS cover relay processes only;
media and input echo timings include the synthetic source and receiver.
"""
import argparse
import asyncio
import json
import multiprocessing as mp
import os
import socket
import struct
import sys
import time
import tracemalloc
from contextlib import asynccontextmanager
from types import SimpleNamespace

import psutil
import uvicorn
import uvloop
from fastapi import FastAPI, WebSocket
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from app.services import desktop_stream

AUDIO_SEQUENCE = 1 << 63


def worker(pipe, target, remote, queue, protocol):
    if queue is not None:
        original = desktop_stream.connect

        def connect_with_queue(*args, **kwargs):
            kwargs['max_queue'] = queue
            return original(*args, **kwargs)

        desktop_stream.connect = connect_with_queue

    @asynccontextmanager
    async def session(host, port):
        yield target, {}

    desktop_stream.gliss_session = session
    app = FastAPI()

    @app.websocket('/tunnel')
    @app.websocket('/vms/{vm_id}/desktop/tunnel')
    async def relay(ws: WebSocket, vm_id: str = 'benchmark'):
        if remote:
            node = SimpleNamespace(hostname='127.0.0.1', port=int(
                target.rsplit(':', 1)[1]), api_key='fixture')
            upstream = desktop_stream.slave_stream(node, vm_id)
        else:
            upstream = desktop_stream.local_stream('fixture', 1)
        await desktop_stream.relay_stream(ws, upstream)

    async def run():
        sock = socket.socket()
        sock.bind(('127.0.0.1', 0))
        server = uvicorn.Server(uvicorn.Config(app, log_level='critical', lifespan='off',
                                               ws=protocol, ws_per_message_deflate=False))
        task = asyncio.create_task(server.serve(sockets=[sock]))
        while not server.started:
            if task.done():
                await task
            await asyncio.sleep(.01)
        pipe.send(f'ws://127.0.0.1:{sock.getsockname()[1]}')
        await asyncio.to_thread(pipe.recv)
        server.should_exit = True
        await task

    uvloop.run(run())


def source_worker(pipe, payload, args, begin):
    """Keep source work off the receiver's event loop and CPU core."""
    start = asyncio.Event()
    admitted = 0

    async def source(stream):
        nonlocal admitted
        index = admitted
        admitted += 1
        if admitted == args.viewers:
            pipe.send('ready')
        credit = asyncio.Semaphore(8)
        audio_stop = asyncio.Event()
        audio_sent = 0
        controls_received = 0

        async def audio():
            nonlocal audio_sent
            await start.wait()
            if args.stagger:
                await asyncio.sleep(index / args.viewers / args.audio_rate)
            while not audio_stop.is_set():
                packet = struct.pack(
                    '!QQ', AUDIO_SEQUENCE + audio_sent, time.monotonic_ns())
                await stream.send(packet + bytes(args.audio_size - 16))
                audio_sent += 1
                await asyncio.sleep(1 / args.audio_rate)

        audio_task = asyncio.create_task(audio()) if args.audio_rate else None

        async def controls():
            nonlocal controls_received
            async for text in stream:
                message = json.loads(text)
                if message['type'] == 'ack':
                    credit.release()
                elif message['type'] == 'ping':
                    await stream.send(text)
                elif message['type'] == 'pointer':
                    controls_received += 1
                elif message['type'] == 'finish':
                    audio_stop.set()
                    if audio_task:
                        await audio_task
                    await stream.send(json.dumps({'type': 'summary', 'controls': controls_received,
                                                  'audio': audio_sent}))

        task = asyncio.create_task(controls())
        try:
            await start.wait()
            if args.stagger and args.fps:
                await asyncio.sleep(index / args.viewers / args.fps)
            for seq in range(args.frames):
                await credit.acquire()
                await stream.send(struct.pack('!QQ', seq, time.monotonic_ns()) + payload)
                if args.fps:
                    await asyncio.sleep(1 / args.fps)
            await stream.wait_closed()
        except ConnectionClosed:
            pass
        finally:
            audio_stop.set()
            if audio_task:
                await asyncio.gather(audio_task, return_exceptions=True)
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def run():
        async with serve(source, '127.0.0.1', 0, compression=None) as server:
            pipe.send(f'ws://127.0.0.1:{server.sockets[0].getsockname()[1]}')
            await asyncio.to_thread(begin.wait)
            start.set()
            await asyncio.Future()

    uvloop.run(run())


async def measure(args, hops):
    context = mp.get_context('spawn')
    payload = os.urandom(args.size - 16)
    start = asyncio.Event()
    begin = context.Event()
    workers = []
    viewers = []
    pipes = []
    relay_controls = []

    async def launch(target, *settings):
        parent, child = context.Pipe()
        pipes.extend([parent, child])
        process = context.Process(target=target, args=(child, *settings))
        process.start()
        workers.append(process)
        if target is worker:
            relay_controls.append(parent)
        child.close()
        if not await asyncio.to_thread(parent.poll, 15):
            raise RuntimeError('Benchmark worker startup timed out')
        return process, parent.recv(), parent

    try:
        source_process, url, source_pipe = await launch(source_worker, payload, args, begin)
        for hop in range(hops):
            _, url, _ = await launch(worker, url, hop > 0, args.queue, args.protocol)
        if hops:
            url += '/tunnel'
        processes = [psutil.Process(p.pid) for p in workers[1:]]
        source = psutil.Process(source_process.pid)
        receiver = psutil.Process()
        latencies = []
        audio_latencies = []
        rtts = []
        input_count = 0
        audio_count = 0
        peak_rss = 0

        async def viewer():
            nonlocal input_count, audio_count
            async with connect(url, compression=None, max_size=None) as stream:
                await start.wait()
                stop_controls = asyncio.Event()
                controls_sent = 0
                video_received = 0
                audio_received = 0

                async def send_controls():
                    nonlocal controls_sent
                    while not stop_controls.is_set():
                        await stream.send(json.dumps({'type': 'pointer', 'x': controls_sent % 1280,
                                                      'y': 100, 'buttons': 0, 'id': controls_sent}))
                        controls_sent += 1
                        await asyncio.sleep(1 / args.input_rate)

                control_task = asyncio.create_task(
                    send_controls()) if args.input_rate else None
                try:
                    while True:
                        data = await stream.recv()
                        now = time.monotonic_ns()
                        if isinstance(data, str):
                            message = json.loads(data)
                            if message['type'] == 'summary':
                                assert video_received == args.frames
                                assert message['controls'] == controls_sent
                                assert message['audio'] == audio_received
                                input_count += controls_sent
                                audio_count += audio_received
                                break
                            rtts.append((now - message['sent']) / 1e6)
                            continue
                        number, sent = struct.unpack('!QQ', data[:16])
                        if number & AUDIO_SEQUENCE:
                            assert number == AUDIO_SEQUENCE + audio_received
                            assert data[16:] == bytes(args.audio_size - 16)
                            audio_received += 1
                            audio_latencies.append((now - sent) / 1e6)
                            continue
                        assert number == video_received and data[16:] == payload
                        video_received += 1
                        latencies.append((now - sent) / 1e6)
                        await stream.send(json.dumps({'type': 'ack', 'sequence': number}))
                        if number % 15 == 0:
                            await stream.send(json.dumps({'type': 'ping', 'sent': time.monotonic_ns()}))
                        if video_received == args.frames:
                            stop_controls.set()
                            if control_task:
                                await control_task
                            await stream.send(json.dumps({'type': 'finish'}))
                finally:
                    stop_controls.set()
                    if control_task:
                        control_task.cancel()
                        await asyncio.gather(control_task, return_exceptions=True)

        async def sample():
            nonlocal peak_rss
            while True:
                peak_rss = max(peak_rss, sum(
                    p.memory_info().rss for p in processes))
                await asyncio.sleep(.02)

        viewers = [asyncio.create_task(viewer()) for _ in range(args.viewers)]
        if not await asyncio.to_thread(source_pipe.poll, 20):
            raise RuntimeError(
                'Not all viewers connected before startup deadline')
        assert source_pipe.recv() == 'ready'
        cpu_start = [sum(p.cpu_times()[:2]) for p in processes]
        source_start = sum(source.cpu_times()[:2])
        receiver_start = sum(receiver.cpu_times()[:2])
        started = time.perf_counter()
        start.set()
        begin.set()
        sampler = asyncio.create_task(sample())
        try:
            expected_duration = args.frames / args.fps if args.fps else 0
            await asyncio.wait_for(asyncio.gather(*viewers), max(60, 2 * expected_duration))
        finally:
            sampler.cancel()
            await asyncio.gather(sampler, return_exceptions=True)
        elapsed = time.perf_counter() - started
        hop_cpu = [sum(p.cpu_times()[:2]) - before
                   for p, before in zip(processes, cpu_start)]
        cpu = sum(hop_cpu)
        source_cpu = sum(source.cpu_times()[:2]) - source_start
        receiver_cpu = sum(receiver.cpu_times()[:2]) - receiver_start

        def p95(values):
            return round(sorted(values)[int(.95 * (len(values) - 1))], 3) if values else None

        return {'hops': hops, 'viewers': args.viewers, 'size_bytes': args.size,
                'frames_each': args.frames, 'fps_limit': args.fps,
                'input_rate_limit': args.input_rate, 'input_messages': input_count,
                'audio_rate_limit': args.audio_rate, 'audio_packets': audio_count,
                'audio_size_bytes': args.audio_size, 'stagger': args.stagger,
                'queue_high_water': args.queue or desktop_stream.RECEIVE_HIGH_WATER,
                'protocol': args.protocol, 'python': sys.version.split()[0],
                'elapsed_s': round(elapsed, 3),
                'relay_cpu_s': round(cpu, 3),
                'relay_cpu_percent_one_core': round(100 * cpu / elapsed, 2),
                'hop_cpu_percent_one_core': [round(100 * value / elapsed, 2) for value in hop_cpu],
                'source_cpu_percent_one_core': round(100 * source_cpu / elapsed, 2),
                'receiver_cpu_percent_one_core': round(100 * receiver_cpu / elapsed, 2),
                'relay_peak_rss_mib': round(peak_rss / 2**20, 2),
                'frames_per_s': round(len(latencies) / elapsed, 1),
                'media_p95_ms': p95(latencies), 'audio_p95_ms': p95(audio_latencies),
                'input_echo_p95_ms': p95(rtts)}
    finally:
        for task in viewers:
            task.cancel()
        await asyncio.gather(*viewers, return_exceptions=True)
        for pipe in relay_controls:
            try:
                pipe.send('stop')
            except (BrokenPipeError, EOFError, OSError):
                pass
        if workers:
            workers[0].terminate()
        for process in workers:
            await asyncio.to_thread(process.join, 5)
            if process.is_alive():
                process.kill()
                await asyncio.to_thread(process.join)
            process.close()
        for pipe in pipes:
            pipe.close()


async def measure_stalled(args):
    queue = args.queue
    blocked = asyncio.Event()
    finished = asyncio.Event()
    paused = asyncio.Event()
    active = None

    class Browser:
        async def accept(self):
            pass

        async def iter_text(self):
            await asyncio.Future()
            yield ''

        async def send_bytes(self, message):
            blocked.set()
            await asyncio.Future()

        async def send_text(self, message):
            pass

    async def native(stream):
        # Match the configured native presentation window without ACKs.
        for i in range(8):
            await stream.send(bytes([i]) * (1024 * 1024))
        finished.set()
        await stream.wait_closed()

    @asynccontextmanager
    async def session(host, port):
        yield url, {}
    original_connect = desktop_stream.connect
    original_session = desktop_stream.gliss_session

    def configured_connect(*args, **kwargs):
        class TrackingConnection(desktop_stream.ClientConnection):
            def connection_made(self, transport):
                nonlocal active
                super().connection_made(transport)
                active = self
                original_pause = self.recv_messages.pause

                def pause():
                    paused.set()
                    original_pause()
                self.recv_messages.pause = pause
        if queue is not None:
            kwargs['max_queue'] = queue
        kwargs['close_timeout'] = .1
        return original_connect(*args, **kwargs, create_connection=TrackingConnection)
    desktop_stream.connect = configured_connect
    desktop_stream.gliss_session = session
    async with serve(native, '127.0.0.1', 0, compression=None, close_timeout=.1) as server:
        url = f'ws://127.0.0.1:{server.sockets[0].getsockname()[1]}'
        tracemalloc.start()
        task = asyncio.create_task(desktop_stream.relay_stream(
            Browser(), desktop_stream.local_stream('fixture', 1)))
        try:
            await asyncio.wait_for(blocked.wait(), 3)
            # Small TCP buffers may block the source before all eight sends
            # finish. Either source completion or paused reads is the signal.
            signals = [asyncio.create_task(event.wait())
                       for event in (finished, paused)]
            try:
                done, _ = await asyncio.wait(signals, timeout=3, return_when=asyncio.FIRST_COMPLETED)
                if not done:
                    raise TimeoutError(
                        'Neither source completion nor read backpressure observed')
            finally:
                for signal in signals:
                    signal.cancel()
                await asyncio.gather(*signals, return_exceptions=True)
            # Let the final TCP read settle; this mode is a memory probe,
            # not a throughput or latency measurement.
            await asyncio.sleep(.1)
            current, peak = tracemalloc.get_traced_memory()
            # Inspect the pinned websockets 15 assembler only in this probe.
            queued = active.recv_messages.frames.queue
            return {'mode': 'stalled', 'queue_high_water': queue or desktop_stream.RECEIVE_HIGH_WATER,
                    'read_paused': paused.is_set(),
                    'source_finished': finished.is_set(),
                    'queued_frames': len(active.recv_messages.frames),
                    'queued_payload_mib': sum(len(frame.data) for frame in queued) / 2**20,
                    'python_retained_mib': round(current / 2**20, 2),
                    'python_peak_mib': round(peak / 2**20, 2)}
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            tracemalloc.stop()
            desktop_stream.connect = original_connect
            desktop_stream.gliss_session = original_session


async def main(args):
    if args.stalled:
        print(json.dumps(await measure_stalled(args)), flush=True)
        return

    for repeat in range(args.repeats):
        for hops in args.hops:
            result = await measure(args, hops)
            print(json.dumps({'repeat': repeat, **result}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--viewers', type=int, default=16)
    parser.add_argument('--frames', type=int, default=150)
    parser.add_argument('--size', type=int, default=8192)
    parser.add_argument('--fps', type=int, default=30)
    parser.add_argument('--input-rate', type=int, default=0,
                        help='Pointer controls per second per viewer')
    parser.add_argument('--audio-rate', type=int, default=0,
                        help='Synthetic audio packets per second per viewer')
    parser.add_argument('--audio-size', type=int, default=1024)
    parser.add_argument('--stagger', action='store_true',
                        help='Spread initial frame and audio phases across viewers')
    parser.add_argument('--queue', type=int)
    parser.add_argument('--protocol', default='auto')
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--stalled', action='store_true',
                        help='Block the receiver after its first write; inspect eight 1 MiB frames')
    parser.add_argument('--hops', type=int, nargs='+', default=[0, 1, 2])
    args = parser.parse_args()
    if min(args.viewers, args.frames, args.repeats) < 1 or args.size < 16 or args.fps < 0:
        parser.error(
            'viewers, frames, repeats must be positive; size >= 16; fps >= 0')
    if args.queue is not None and args.queue < 1:
        parser.error('queue must be positive')
    if min(args.input_rate, args.audio_rate) < 0 or args.audio_size < 16:
        parser.error(
            'input/audio rates must be nonnegative and audio size >= 16')
    if any(hops not in (0, 1, 2) for hops in args.hops):
        parser.error('hops must be 0, 1, or 2')
    uvloop.run(main(args))
