# Desktop performance profiling

Profiling is off by default. Use the explicit override with one existing Compose
profile; it changes the selected services without adding another backend:

```sh
docker compose -f docker-compose.yml -f docker-compose.profiling.yml --profile master up -d --build
```

For development, select `--profile dev` instead. On a slave, select `--profile slave`.
Enable the override on the host running the VM to obtain native stream statistics;
a master only relaying a slave's stream cannot enable statistics on that slave.
These are operator commands, not steps performed automatically by the viewer.

The override sets `GLISS_PROFILING=true` on the existing backend, backend-dev and
slave services. The backend accepts only the canonical strings `true` and `false`;
an absent value means `false`. Invalid values fail before reserving a port or
starting Gliss. Enabling adds only `--stream-stats`; frame rate, bitrate, in-flight
window and audio settings keep their existing values.

For production, the override passes `VITE_GLISS_PROFILING=true` as a Docker build
argument. Vite bakes this gate into the frontend bundle, so setting it only in a
running production container does not enable the panel. Rebuild the frontend when
enabling or disabling this gate. Its Docker build argument defaults to `false`.
The development override sets the Vite process environment instead.

Open the desktop viewer with `profiling=1` added to its current query string. Both
the build gate and this exact query value must be enabled. The panel loads lazily;
normal viewing mounts no profiling panel, starts no profiling timers, downloads no
profiling module and sends no probes. URL parsing uses the existing router state,
and rendering does not read browser globals during server rendering or hydration.

Click **Record 15 seconds** to start measurement and one control probe per second.
Progress refreshes at most twice per second while recording. **Stop** ends it early;
the Gliss client also ends it automatically and on disconnect. Closing the viewer,
disconnecting or abandoning an async start releases its handle. The API caps any
recording at 60 seconds. No browser or VM identifier is passed to this API.
The optional async `client.startProfiling({ durationMs: 15000, probeIntervalMs: 1000 })`
API returns a handle with synchronous `snapshot()` and idempotent `stop()` methods.
Both return a `gliss-profile-v1` report; a rejected start must release any partial
recording inside Gliss because no handle was returned to the caller.
The API is checked on the already connected client: older installed Gliss
versions show a friendly unavailable message inside the panel. The pinned
`gliss-server` dependency is unchanged; operators need a compatible Gliss release
to actually record.

**Download JSON** saves `gliss-profile.json` locally. Reports are never uploaded.
The download retains the `gliss-profile-v1` summary and bounded numeric frame/server
measurements. It excludes extra metadata, arbitrary strings/errors, URLs,
credentials, VM/session identifiers, clipboard text, key contents and pixels.
Unknown stop reasons become `other`; numeric omission counts describe dropped
samples. The recording uses the current desktop connection without creating a
second client or changing reconnect behavior.

Profiling adds timing work, control probes and optional native stream-stat traffic
only when opted in. Native stream statistics can add traffic whenever the backend
override is enabled, even before Record; browser collection/probes begin only on
Record. To return to normal operation, omit the override and recreate the selected
services, rebuilding the production frontend with its default gate.

Receive-to-canvas timing ends at the browser canvas, not the physical display.
Control round trip includes the current transport and any relay. Gliss process CPU
is measured relative to one core, so it can exceed 100%; it excludes the backend
relay, QEMU and guest workloads. CPU/native timing fields can be unavailable and
remain `null`; do not treat them as zero. Missing native statistics, relay work,
guest rendering and physical display latency limit what the report can explain.

Run the focused tests and frontend checks from the repository root:

```sh
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend backend/venv/bin/python -m pytest backend/tests/test_gliss_profiling.py -q
cd frontend
node --experimental-strip-types --test tests/gliss-profiling.test.mjs
pnpm format:check
pnpm typecheck
VITE_GLISS_PROFILING=false pnpm build
VITE_GLISS_PROFILING=true pnpm build
```

Use Node.js 24 for the built-in test runner's TypeScript support. No frontend test
framework or new dependency is required. Compose merging should also be checked
with `docker compose -f docker-compose.yml -f docker-compose.profiling.yml --profile master config --quiet`,
then with `dev` and `slave`; this does not start services.
