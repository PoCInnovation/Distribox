import assert from "node:assert/strict";
import test from "node:test";
import {
  createProfilingRecorder,
  downloadProfile,
  profileForDownload,
} from "../app/lib/gliss-profiling.ts";

function report(overrides = {}) {
  return {
    schema: "gliss-profile-v1",
    state: "recording",
    stop_reason: null,
    duration_ms: 500,
    summary: {
      painted_frames: 12,
      receive_to_canvas_ms: { p95: 4 },
      control_round_trip_ms: null,
      process_cpu_percent_one_core: null,
    },
    frames: [{ receive_to_canvas_ms: 4 }],
    server: [],
    omitted: {},
    ...overrides,
  };
}

function handle(t, snapshot = () => report()) {
  return {
    snapshot: t.mock.fn(snapshot),
    stop: t.mock.fn(() => report({ state: "stopped", stop_reason: "manual" })),
  };
}

test("idle is inert; Record polls at 2Hz; Stop is idempotent and clears polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const recording = handle(t);
  const start = t.mock.fn(async () => recording);
  const views = [];
  const recorder = createProfilingRecorder(start, (view) => views.push(view));
  t.after(() => recorder.dispose());
  t.mock.timers.tick(5000);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(views.length, 0);

  await recorder.record();
  assert.deepEqual(start.mock.calls[0].arguments, [
    { durationMs: 15000, probeIntervalMs: 1000 },
  ]);
  assert.equal(recording.snapshot.mock.callCount(), 1);
  t.mock.timers.tick(499);
  assert.equal(recording.snapshot.mock.callCount(), 1);
  t.mock.timers.tick(1);
  assert.equal(recording.snapshot.mock.callCount(), 2);
  recorder.stop();
  recorder.stop();
  const updates = views.length;
  t.mock.timers.tick(2000);
  assert.equal(recording.snapshot.mock.callCount(), 2);
  assert.equal(recording.stop.mock.callCount(), 1);
  assert.equal(views.length, updates);
  assert.equal(views.at(-1).report.state, "stopped");
});

for (const snapshot of [
  () => report({ state: "stopped", stop_reason: "duration" }),
  () => report({ duration_ms: 15000 }),
]) {
  test(`automatic completion releases the handle: ${snapshot().state}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const recording = handle(t, snapshot);
    const views = [];
    const recorder = createProfilingRecorder(async () => recording, (view) => views.push(view));
    await recorder.record();
    t.mock.timers.tick(2000);
    assert.equal(recording.snapshot.mock.callCount(), 1);
    assert.equal(recording.stop.mock.callCount(), 1);
    assert.equal(views.at(-1).status, "stopped");
    recorder.dispose();
  });
}

for (const action of ["stop", "dispose"]) {
  test(`${action} during async start releases a late handle without late updates`, async (t) => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const recording = handle(t);
    const views = [];
    const recorder = createProfilingRecorder(() => pending, (view) => views.push(view));
    const started = recorder.record();
    recorder[action]();
    const updates = views.length;
    resolve(recording);
    await started;
    assert.equal(recording.stop.mock.callCount(), 1);
    assert.equal(recording.snapshot.mock.callCount(), 0);
    assert.equal(views.length, updates);
    recorder.dispose();
  });
}

test("disconnect/unmount disposal stops an active handle without updating the panel", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const recording = handle(t);
  const views = [];
  const recorder = createProfilingRecorder(async () => recording, (view) => views.push(view));
  await recorder.record();
  recorder.dispose();
  const updates = views.length;
  t.mock.timers.tick(2000);
  assert.equal(recording.stop.mock.callCount(), 1);
  assert.equal(recording.snapshot.mock.callCount(), 1);
  assert.equal(views.length, updates);
});

test("a missing optional capability is reported without starting timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const views = [];
  const recorder = createProfilingRecorder(async () => null, (view) => views.push(view));
  await recorder.record();
  const updates = views.length;
  t.mock.timers.tick(2000);
  assert.deepEqual(views.at(-1), { status: "unavailable", report: null });
  assert.equal(views.length, updates);
  recorder.dispose();
});

test("failed async starts and snapshots expose no arbitrary errors", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fail = () => { throw new Error("private credential sentinel"); };
  const views = [];
  const failed = createProfilingRecorder(async () => fail(), (view) => views.push(view));
  await failed.record();
  assert.deepEqual(views.at(-1), { status: "error", report: null });
  failed.dispose();

  const recording = handle(t, fail);
  const recorder = createProfilingRecorder(async () => recording, (view) => views.push(view));
  await recorder.record();
  assert.equal(recording.stop.mock.callCount(), 1);
  assert.equal(views.at(-1).status, "error");
  t.mock.timers.tick(2000);
  assert.equal(recording.snapshot.mock.callCount(), 1);
  assert.ok(!JSON.stringify(views).includes("sentinel"));
  recorder.dispose();
});

test("a rejected start after unmount makes no late state commit", async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const views = [];
  const recorder = createProfilingRecorder(() => pending, (view) => views.push(view));
  const started = recorder.record();
  recorder.dispose();
  const updates = views.length;
  reject(new Error("private start failure"));
  await started;
  assert.equal(views.length, updates);
});

test("downloads retain bounded numeric measurements and exclude private or arbitrary data", () => {
  const privateData = {
    url: "private sentinel",
    credential: "private sentinel",
    vm_id: 12345,
    session_id: 12345,
    clipboard: "private sentinel",
    key: 97,
    pixels: [1, 2, 3],
    error: "private sentinel",
    password: 12345,
  };
  const raw = report({
    ...privateData,
    stop_reason: "private sentinel",
    summary: { ...report().summary, ...privateData },
    frames: Array(4100).fill({ ...privateData, receive_to_canvas_ms: 5 }),
    server: Array(121).fill({ ...privateData, process_cpu_percent_one_core: 12 }),
    omitted: { ...privateData, frames: 3 },
  });
  const safe = profileForDownload(raw);
  assert.equal(safe.schema, "gliss-profile-v1");
  assert.equal(safe.summary.receive_to_canvas_ms.p95, 4);
  assert.equal(safe.summary.process_cpu_percent_one_core, null);
  assert.deepEqual(safe.frames[0], { receive_to_canvas_ms: 5 });
  assert.equal(safe.frames.length, 4096);
  assert.equal(safe.server.length, 120);
  assert.deepEqual(safe.omitted, { frames: 3, download_frames: 4, download_server: 1 });
  assert.deepEqual(profileForDownload(safe), safe);
  assert.ok(!JSON.stringify(safe).includes("sentinel"));
  assert.ok(!JSON.stringify(safe).includes("12345"));
});

test("JSON download uses the fixed local filename and releases its object URL", async (t) => {
  const link = { click: t.mock.fn(), remove: t.mock.fn() };
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => link,
    body: { appendChild: t.mock.fn() },
  };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  let blob;
  t.mock.method(URL, "createObjectURL", (data) => {
    blob = data;
    return "blob:profiling";
  });
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  const large = report({ state: "stopped", frames: Array(4000).fill({
    t_ms: 12345, bytes: 12345, receive_to_canvas_ms: 12345,
  }) });
  assert.ok(JSON.stringify(profileForDownload(large)).length > 220000);
  downloadProfile(large);
  assert.equal(link.download, "gliss-profile.json");
  assert.equal(link.href, "blob:profiling");
  assert.equal(link.click.mock.callCount(), 1);
  assert.equal(link.remove.mock.callCount(), 1);
  assert.deepEqual(revoke.mock.calls[0].arguments, ["blob:profiling"]);
  assert.equal(JSON.parse(await blob.text()).schema, "gliss-profile-v1");
  assert.ok(blob.size <= 262144);
});


test("downloads use fixed field allowlists, preserving deadline and native CPU without unknown numeric IDs", () => {
  const safe = profileForDownload(report({ state: "stopped", stop_reason: "deadline",
    frames: [{ receive_to_canvas_ms: 5, unrecognized_numeric_value: 12345 }],
    server: [{ process_cpu: { elapsed_ms: 1000, user_ms: 20, system_ms: 2, unrecognized_numeric_value: 12345 } }],
  }));
  assert.equal(safe.stop_reason, "deadline");
  assert.deepEqual(safe.server[0].process_cpu, { elapsed_ms: 1000, user_ms: 20, system_ms: 2 });
  assert.ok(!JSON.stringify(safe).includes("12345"));
});
