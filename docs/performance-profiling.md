# Desktop profiling

Profiling is off by default. Enable it with the Compose override:

```sh
docker compose -f docker-compose.yml -f docker-compose.profiling.yml --profile master up -d --build
```

Use `dev` or `slave` instead of `master` as needed. Enable the override on the VM's
host for native statistics.

Add `profiling=1` to the viewer's query string. Click **Record 15 seconds**, then
**Download JSON**. Recording stops automatically or on disconnect. Older Gliss
releases without profiling support show an unavailable message.

Reports stay local and exclude credentials, inputs and pixels. CPU covers the
Gliss process only; browser timings end at Canvas submission.

To disable profiling, omit the override and run `up -d --build` again.

## Measure the WebSocket relay

Run from the repository root with the backend requirements installed:

```sh
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py
```

The benchmark uses the production relay functions with a synthetic source and
receiver. Source, each relay hop and receiver run in separate processes. Results
include CPU for every process so a busy generator can be distinguished from a
busy relay. Small FastAPI apps replace authentication and VM lookup.

Defaults are 16 viewers, 150 frames per viewer, 8 KiB per frame, 30 fps and three
runs each of direct, one-hop and two-hop delivery. Video uses eight ACK credits.
Every video/audio packet is checked for byte integrity and sequence, and a final
barrier verifies that every sent pointer control reached the source.

Add audio and pointer traffic, spreading initial frame/audio phases across
viewers:

```sh
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py --viewers 64 --input-rate 60 --audio-rate 50 --stagger
```

The audio packets are synthetic 1 KiB binary messages, without encoding or
decoding. Input and audio rates are upper limits; inspect the delivered counts
when the system is overloaded. Omit `--stagger` for synchronized bursts. Use
`--fps 0 --frames 300 --viewers 256` for uncapped video throughput.

Results are JSON lines. CPU is a percentage of one core; aggregate relay CPU can
exceed 100% when two relay processes are used. RSS includes interpreter/import
overhead. Media/audio p95 measures source send to receiver delivery, and
`input_echo_p95_ms` measures a small JSON control round trip. These are transport
timings, not guest input response or browser painting.

## Stalled viewers

Compare receive high-water marks without editing application code:

```sh
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py --stalled --queue 16
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py --stalled --queue 2
```

This probe offers eight 1 MiB frames and blocks the first downstream write. The
source may itself block before finishing all eight sends; this is backpressure,
not a probe failure. Queue inspection uses the pinned websockets 15 internals.

Both upstream connections now use a receive high-water mark of two frames.
On Python 3.13, the probe retained seven queued frames before the change and two
afterward, with upstream reads paused. The threshold is not a strict frame or
memory cap: a network read can exceed it. Regression tests verify that both
connection types preserve all eight frames, in order, after the viewer resumes.
Gliss's eight-credit presentation window is separate from this receive queue.

The allocation counters include the source and relay in this probe, excluding
kernel buffers. Backpressure can move retained data into source write buffers;
these counters do not prove a whole-session memory reduction. See the
[websockets buffer guide](https://websockets.readthedocs.io/en/15.0/topics/memory.html).

## Is Python a bottleneck?

It becomes one at high message rates. This does not establish that it limits a
typical workshop. The following results describe this host and this synthetic
workload, not a deployment capacity guarantee.

Measurements on 2026-11-04 used an Intel Core i5-13600KF, Linux, Python 3.13.12
with the GIL enabled, uvloop 0.23.0, Uvicorn 0.53.0 and websockets 15.0.1.
Processes were not pinned to cores; the host has both performance and efficiency
cores. Results below are medians of three runs, each with 150 video frames per
viewer, except the uncapped runs which use 300.

[Raw samples and profile summary](benchmarks/tunnel-capacity-2026-11-04.jsonl)
include source and receiver CPU, per-hop CPU, delivered traffic and timings.

- **64 viewers, video only:** approximately 30 fps per viewer. One hop used
  20.9% of one core; two hops used 18.6% and 18.2%. p95 control RTT stayed below
  4 ms. Scheduling and batching mean two-hop timings need not exceed one-hop
  timings in every short run.
- **64 viewers, video + audio + pointer controls:** approximately 30 fps per
  viewer, with pointer traffic capped at 60/s and audio at 50 packets/s.
  One hop used 42.9% of one core; two hops used about 43% each. p95 control RTT
  was 1.8 ms direct, 2.2 ms through one hop and 3.1 ms through two.
- **512 viewers with the same mixed workload:** relay CPU reached about 91%
  of one core per hop. Median source/receiver CPU was below 72%. p95 control RTT
  rose from 5.5 ms direct to 99.6 ms through one hop and 212.7 ms through two.
  Delivery fell from 29.9 fps per viewer direct to 29.3 and 28.6 fps respectively.
  This separates a relay limit from generator saturation.
- **1,024 viewers with the mixed workload:** the direct generator/receiver also
  saturated, so this case cannot identify the relay's exact capacity on its own.
  Direct delivery was 25.1 fps per viewer, compared with 12.2 through one hop
  and 8.9 through two. Two-hop p95 control RTT exceeded one second.
- **Uncapped video, 256 viewers:** aggregate delivery was about 69,081 frames/s
  direct, 47,540 through one hop and 45,296 through two. A relay used about 91–93%
  of one core while the source and receiver used about 57–63%. This confirms a
  throughput ceiling in the Python relay stack.

Video payload is about 2 Mbit/s per viewer at 30 fps; synthetic audio adds up to
0.41 Mbit/s. The larger cases exceed ordinary 1 Gbit/s network capacity, even
though loopback can carry them. Native encoding, real network delay/loss, TLS,
nginx, full application activity and browser decoding/rendering are excluded.

A separate py-spy run sampled 816 GIL-held relay stacks. The busiest leaf
functions were Uvicorn's WebSocket send path, websockets' send/parse/serialize
paths and their queues. Only 27 sampled leaves were in the application relay
file. This points toward protocol and per-message overhead rather than a large
computation in the relay function. Profiling added overhead and its throughput
is excluded from the capacity medians.

To repeat the sample, install py-spy separately from application dependencies:

```sh
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend py-spy record --subprocesses --gil --format raw --rate 100 --output /tmp/tunnel-profile.raw -- python backend/tools/benchmark_desktop_relay.py --viewers 256 --frames 300 --repeats 1 --input-rate 60 --audio-rate 50 --stagger --hops 1
```

Short exploratory comparisons with the deprecated `websockets` protocol and
with `wsproto` did not establish a benefit over the current default. The app
already forwards encoded video as binary, without decoding, re-encoding or
base64 conversion. Compression is disabled on both upstream connections and in
the Docker commands.

## Next changes to evaluate

For a large deployment, remove a media relay hop first. Slave traffic currently
follows VNC → Gliss → slave backend → master backend → browser. An authenticated,
browser-reachable node gateway could avoid master forwarding; a native gateway
could also avoid Python's per-message cost. This needs a ticket/routing design
and must preserve authentication, resize ownership and viewer isolation. The
private Gliss listener cannot be exposed as a substitute.

Keep VM lifecycle and authentication in Python unless their own measurements
show a limit. Increasing Uvicorn workers requires other changes:
the SSH listener belongs to one backend worker, and resize ownership is stored
in process-local memory. Media workers need their own routing/state design.

Each viewer also starts a separate Gliss process, VNC connection and encoder.
Sharing capture or encoding for multiple viewers of one VM may reduce native
work, but needs independent flow control and recovery so an observer cannot
stall the student. Its savings were not measured by this transport benchmark.

Before changing deployment capacity, measure native, backend and browser cost
together on the deployment hardware. The existing downloaded profile covers
Gliss CPU only. Lowering `GLISS_FPS` is an available smoothness/resource tradeoff;
bitrate is a soft encoder target, not a CPU quota.
