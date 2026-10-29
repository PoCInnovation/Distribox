import { useEffect, useRef, useState } from "react";
import {
  createProfilingRecorder,
  downloadProfile,
} from "@/lib/gliss-profiling";
import type { ProfilingView, StartProfiling } from "@/lib/gliss-profiling";

export default function ProfilingPanel({
  connected,
  startProfiling,
}: {
  connected: boolean;
  startProfiling: StartProfiling;
}) {
  const [view, setView] = useState<ProfilingView>({
    status: "idle",
    report: null,
  });
  const [downloadFailed, setDownloadFailed] = useState(false);
  const recorderRef = useRef<ReturnType<typeof createProfilingRecorder> | null>(
    null,
  );

  useEffect(() => {
    const recorder = createProfilingRecorder(startProfiling, setView);
    recorderRef.current = recorder;
    return () => {
      recorderRef.current = null;
      recorder.dispose();
    };
  }, [startProfiling]);

  useEffect(() => {
    if (!connected) recorderRef.current?.stop();
  }, [connected]);

  const busy = view.status === "starting" || view.status === "recording";
  const summary = view.report?.summary;
  const ms = (value: { p95: number } | null | undefined) =>
    value ? `${value.p95.toFixed(1)} ms` : "unavailable";
  const buttonClass =
    "rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25 disabled:opacity-50";

  return (
    <aside
      aria-label="Desktop profiling"
      className="absolute bottom-3 right-3 z-50 max-w-sm rounded-lg border border-white/20 bg-black/85 p-3 text-xs text-white shadow-lg"
    >
      <p className="mb-2 font-semibold">Desktop profiling</p>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={!connected || busy}
          onClick={() => {
            setDownloadFailed(false);
            void recorderRef.current?.record();
          }}
        >
          Record 15 seconds
        </button>
        <button
          className={buttonClass}
          disabled={!busy}
          onClick={() => recorderRef.current?.stop()}
        >
          Stop
        </button>
        <button
          className={buttonClass}
          disabled={!view.report || busy}
          onClick={() => {
            if (!view.report) return;
            try {
              downloadProfile(view.report);
              setDownloadFailed(false);
            } catch {
              setDownloadFailed(true);
            }
          }}
        >
          Download JSON
        </button>
      </div>
      <p role="status" className="mt-2 text-white/70">
        {connected ? view.status : "Disconnected"}
        {view.report &&
          ` · ${(view.report.duration_ms / 1000).toFixed(1)} s · ${summary?.painted_frames} frames`}
      </p>
      {summary && (
        <p className="mt-1 text-white/70">
          Receive to canvas p95: {ms(summary.receive_to_canvas_ms)}
          <br />
          Control round trip p95: {ms(summary.control_round_trip_ms)}
          <br />
          Gliss CPU (one core):{" "}
          {summary.process_cpu_percent_one_core === null
            ? "unavailable"
            : `${summary.process_cpu_percent_one_core.toFixed(1)}%`}
        </p>
      )}
      {view.status === "unavailable" && (
        <p className="mt-2">
          Profiling is unavailable. This Gliss version may not support
          recording.
        </p>
      )}
      {view.status === "error" && (
        <p className="mt-2">
          Recording could not complete. Reconnect and try again.
        </p>
      )}
      {downloadFailed && (
        <p className="mt-2">The report could not be downloaded.</p>
      )}
    </aside>
  );
}
