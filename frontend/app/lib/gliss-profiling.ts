export interface GlissProfileReport {
  schema: "gliss-profile-v1";
  state: "recording" | "stopped";
  stop_reason: string | null;
  duration_ms: number;
  summary: {
    painted_frames: number;
    receive_to_canvas_ms: { p95: number } | null;
    control_round_trip_ms: { p95: number } | null;
    process_cpu_percent_one_core: number | null;
  };
  frames: unknown[];
  server: unknown[];
  omitted: Record<string, unknown>;
}

export interface GlissProfilingOptions {
  durationMs: number;
  probeIntervalMs: number;
}

export interface GlissProfilingHandle {
  snapshot(): GlissProfileReport;
  stop(): GlissProfileReport;
}

// null is the capability guard for an older or unavailable Gliss client.
export type StartProfiling = (
  options: GlissProfilingOptions,
) => Promise<GlissProfilingHandle | null>;

export type ProfilingView = {
  status:
    | "idle"
    | "starting"
    | "recording"
    | "stopped"
    | "unavailable"
    | "error";
  report: GlissProfileReport | null;
};

const DURATION_MS = 15_000;
const STOP_REASONS = new Set([
  "manual",
  "deadline",
  "clock",
  "duration",
  "completed",
  "disconnect",
  "disconnected",
  "disposed",
  "timeout",
  "error",
  "stopped",
]);
const finite = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1e15
    ? value
    : null;

const FRAME_FIELDS = [
  "t_ms",
  "bytes",
  "queue_ms",
  "decode_ms",
  "raf_wait_ms",
  "canvas_submit_ms",
  "receive_to_canvas_ms",
];
const TIMING_FIELDS = [
  "encode_ms",
  "encode_cpu_ms",
  "encode_worker_wait_ms",
  "source_age_ms",
  "write_ms",
  "enqueue_to_ack_ms",
  "byte_capacity_wait_ms",
];
const COUNTER_FIELDS = [
  "encoded_frames",
  "written_frames",
  "acknowledged_frames",
  "observed_capture_replacements",
  "resyncs",
];
function measurements(
  value: unknown,
  fields: string[],
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>,
    output: Record<string, number> = {};
  for (const field of fields) {
    const number = finite(input[field]);
    if (number !== null) output[field] = number;
  }
  return output;
}
function serverMeasurements(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = measurements(value, [
    "t_ms",
    "generation",
    "reserved_frames",
    "reserved_bytes",
    "waiting_encoded_bytes",
    "writer_jobs",
  ]);
  const counters: Record<string, unknown> = measurements(
    input.counters,
    COUNTER_FIELDS,
  );
  if (input.counters && typeof input.counters === "object") {
    for (const field of TIMING_FIELDS) {
      const timing = measurements(
        (input.counters as Record<string, unknown>)[field],
        ["count", "total_ms", "max_ms"],
      );
      if (Object.keys(timing).length === 3) counters[field] = timing;
    }
  }
  if (Object.keys(counters).length) output.counters = counters;
  const cpu = measurements(input.process_cpu, [
    "elapsed_ms",
    "user_ms",
    "system_ms",
  ]);
  if (Object.keys(cpu).length === 3) output.process_cpu = cpu;
  return output;
}

/** Do not export arbitrary metadata or strings added by a future client. */
export function profileForDownload(
  report: GlissProfileReport,
): GlissProfileReport {
  if (
    report.schema !== "gliss-profile-v1" ||
    (report.state !== "recording" && report.state !== "stopped")
  ) {
    throw new Error("Unsupported profiling report");
  }
  const p95 = (value: { p95: number } | null) => {
    const number = finite(value?.p95);
    return number === null ? null : { p95: number };
  };
  const exported: GlissProfileReport = {
    schema: "gliss-profile-v1",
    state: report.state,
    stop_reason:
      report.stop_reason === null
        ? null
        : STOP_REASONS.has(report.stop_reason)
          ? report.stop_reason
          : "other",
    duration_ms: finite(report.duration_ms) ?? 0,
    summary: {
      painted_frames: finite(report.summary.painted_frames) ?? 0,
      receive_to_canvas_ms: p95(report.summary.receive_to_canvas_ms),
      control_round_trip_ms: p95(report.summary.control_round_trip_ms),
      process_cpu_percent_one_core: finite(
        report.summary.process_cpu_percent_one_core,
      ),
    },
    frames: report.frames
      .slice(0, 4096)
      .map((entry) => measurements(entry, FRAME_FIELDS)),
    server: report.server.slice(0, 120).map(serverMeasurements),
    omitted: {
      ...measurements(report.omitted, [
        "frames",
        "server",
        "invalid",
        "download_frames",
        "download_server",
      ]),
      download_frames:
        (finite(report.omitted.download_frames) ?? 0) +
        Math.max(0, report.frames.length - 4096),
      download_server:
        (finite(report.omitted.download_server) ?? 0) +
        Math.max(0, report.server.length - 120),
    },
  };
  if (JSON.stringify(exported).length > 262144)
    throw new Error("Profiling report exceeds the export limit");
  return exported;
}

/** Created only by the opt-in panel. Nothing starts until record() is called. */
export function createProfilingRecorder(
  start: StartProfiling,
  update: (view: ProfilingView) => void,
) {
  let disposed = false;
  let active = false;
  let generation = 0;
  let handle: GlissProfilingHandle | null = null;
  let report: GlissProfileReport | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (status: ProfilingView["status"]) => {
    if (!disposed) update({ status, report });
  };

  function stop(failed = false) {
    clearTimeout(timer);
    timer = undefined;
    if (!active && !handle) return;
    active = false;
    generation++;
    const current = handle;
    handle = null;
    try {
      if (current) report = profileForDownload(current.stop());
    } catch {
      report = null;
      failed = true;
    }
    emit(failed ? "error" : "stopped");
  }

  function poll() {
    if (disposed || !handle) return;
    try {
      report = profileForDownload(handle.snapshot());
      if (report.state === "stopped" || report.duration_ms >= DURATION_MS) {
        stop();
        return;
      }
      emit("recording");
      timer = setTimeout(poll, 500);
    } catch {
      stop(true);
    }
  }

  return {
    async record() {
      if (disposed || active) return;
      active = true;
      report = null;
      const current = ++generation;
      emit("starting");
      try {
        const next = await start({
          durationMs: DURATION_MS,
          probeIntervalMs: 1000,
        });
        if (disposed || current !== generation) {
          next?.stop();
          return;
        }
        if (!next) {
          active = false;
          emit("unavailable");
          return;
        }
        handle = next;
        poll();
      } catch {
        if (!disposed && current === generation) stop(true);
      }
    },
    stop: () => stop(),
    dispose() {
      disposed = true;
      stop();
    },
  };
}

export function downloadProfile(report: GlissProfileReport) {
  const data = JSON.stringify(profileForDownload(report));
  const link = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  try {
    link.href = url;
    link.download = "gliss-profile.json";
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
