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

## Stalled viewers and cleanup

Both upstream WebSocket connections use a two-second close-handshake deadline.
When reads are paused by a stalled viewer, the client can miss the peer's close
frame or FIN. The library's default ten-second wait then delays Gliss/VNC
cleanup after the viewer has disconnected. Regression tests exercise this
through real Uvicorn connections for both local and slave upstreams, without
draining first. They fail when the ten-second default is restored.

The two seconds bound the upstream WebSocket handshake, not total process
shutdown. Gliss termination has its own timeout. Healthy connections complete
the handshake immediately; this change does not make active frame delivery
faster.

The stalled-viewer probe now uses a real Uvicorn relay and a viewer that stops
reading from its socket, then disconnects. It reports queued frames/bytes,
whether reads paused, and elapsed time until the upstream session exits:

```sh
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py --stalled --size 8192
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py --stalled --size 1048576 --audio-rate 50
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python backend/tools/benchmark_desktop_relay.py --stalled --size 1048576 --audio-rate 50 --close-timeout 10
```

The last two commands force backpressure quickly with eight large video
packets and small audio packets. In three interleaved comparisons, the median
teardown wait fell from 10.002 s to 2.002 s. The probe uses production connection
settings unless an override is explicitly supplied; it no longer hides cleanup
behind a 0.1 s timeout. Increase `--stall-seconds` for longer stalls; a session
that ends during the stall is reported separately.

## Why the receive-queue change was dropped

Production retains the pinned websockets 15 receive high-water mark of 16.
The proposed reduction to two showed no established benefit for normal video.
At 2 Mbit/s and 30 fps, a video frame averages about 8 KiB. Even at 50 Mbit/s the
average is about 208 KiB, although individual keyframes can be larger because
bitrate is a soft target.

In the real-Uvicorn video-only probe, eight frames of 8 KiB, 64 KiB or 256 KiB
left the relay's receive queue empty with either setting. The data fitted into
socket/transport buffers. This loopback result does not cover all WAN buffer
sizes or blackholes. Long audio stalls can form a queue, but the savings from
fewer small packets are limited.

The original 7-to-2-frame result blocked a mock browser's first write and used
1 MiB packets. It does not demonstrate a production video-memory saving.
Those two historical records are labeled `mock_stalled_candidate` in the
original dataset.

Interleaved A/B runs of 512 mixed-traffic viewers and 256 uncapped video viewers,
three runs per queue size and hop count, showed no consistent throughput
advantage for either queue. The final change therefore retains the default
queue and fixes teardown instead. Both the queue and Gliss's separate
eight-credit presentation window remain unchanged in production.

[Review follow-up measurements](benchmarks/tunnel-review-2026-11-04.jsonl)
contain these A/B runs, the real stalled probes, and a capacity rerun with the
final production settings. The allocation counters from the old mock probe
included both source and relay, excluding kernel buffers; backpressure can move
data upstream, so they are not a whole-session memory bound. See the
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
These initial capacity samples used the candidate queue of two and the old
ten-second close timeout. The follow-up A/B data above compares the default
queue of 16; the final-config rerun is described below. These unpinned CPU
measurements can vary substantially with scheduling on this P/E-core host.

- **64 viewers, video only:** approximately 30 fps per viewer. One hop used
  about 21% of one core; two hops used about 19% and 18%. p95 control RTT stayed
  below 4 ms. Scheduling and batching mean two-hop timings need not exceed one-hop
  timings in every short run.
- **64 viewers, video + audio + pointer controls:** approximately 30 fps per
  viewer, with pointer traffic capped at 60/s and audio at 50 packets/s.
  One hop used about 43% of one core; two hops used about 43% each. p95 control RTT
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

With the final production settings (queue 16, close timeout 2 s), three new
512-viewer mixed-traffic runs through two hops delivered about 29.2 fps per
viewer, with median p95 control RTT around 174 ms. Each relay used about 90% of
one core; source and receiver used about 60% and 64%. This reproduces the relay
saturation finding without retaining the rejected queue change.

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
