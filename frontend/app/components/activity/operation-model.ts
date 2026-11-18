import type { Operation } from "@/lib/types";

/** How long a finished success stays in the compact sidebar bar. */
export const RECENT_SUCCESS_MS = 3 * 60_000;

const PHASE_LABELS: Record<string, string> = {
  fetching_image: "Getting image",
  copying_disk: "Copying disk",
  resizing_disk: "Resizing disk",
  defining: "Registering VM",
  starting: "Starting VM",
};

/** Relative width of each phase in the segmented bar. */
const PHASE_WEIGHTS: Record<string, number> = {
  fetching_image: 1,
  copying_disk: 6,
  resizing_disk: 1,
  defining: 1,
  starting: 1,
};

export function phaseLabel(op: Operation, phase = op.phase): string {
  if (phase === "creating_on_node") {
    return `Creating on ${op.slave_name ?? "slave"}`;
  }
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, " ");
}

export function phaseWeight(phase: string): number {
  return PHASE_WEIGHTS[phase] ?? 1;
}

export function phaseIndex(op: Operation): number {
  return Math.max(0, op.phases.indexOf(op.phase));
}

export function isFinished(op: Operation): boolean {
  return op.status !== "running";
}

export function needsAttention(op: Operation): boolean {
  return op.status === "failed" || op.status === "interrupted";
}

/** Fraction of the current phase, or null when it can't be measured. */
export function phaseFraction(op: Operation): number | null {
  if (op.indeterminate || op.bytes_done == null || !op.bytes_total) {
    return null;
  }
  return Math.min(1, Math.max(0, op.bytes_done / op.bytes_total));
}

function seconds(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 1000;
}

/** Average bytes per second over the current phase, from server timestamps. */
export function phaseSpeed(op: Operation): number | null {
  if (phaseFraction(op) === null || !op.bytes_done) return null;
  const elapsed = seconds(op.phase_started_at, op.updated_at);
  if (!(elapsed >= 1)) return null;
  return op.bytes_done / elapsed;
}

export function phaseEtaSeconds(op: Operation): number | null {
  const speed = phaseSpeed(op);
  if (!speed || op.bytes_total == null || op.bytes_done == null) return null;
  return Math.max(0, (op.bytes_total - op.bytes_done) / speed);
}

export function formatBytes(bytes: number): string {
  const gb = bytes / 2 ** 30;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 2 ** 20)} MB`;
}

export function formatRate(bytesPerSecond: number): string {
  const mb = bytesPerSecond / 2 ** 20;
  return mb >= 10 ? `${Math.round(mb)} MB/s` : `${mb.toFixed(1)} MB/s`;
}

export function formatEta(totalSeconds: number): string {
  if (totalSeconds < 45) return "almost done";
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

/** "0:42", "12:05", "1:04:09". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatAgo(iso: string, now: number): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Whether the operation left a VM behind that can be opened. */
export function hasVm(op: Operation): boolean {
  if (!op.vm_id) return false;
  return (
    op.status === "succeeded" ||
    (op.status === "failed" && op.phase === "starting")
  );
}

export function outcomeLabel(op: Operation): string {
  switch (op.status) {
    case "succeeded":
      return op.phase === "starting" ? "Running" : "Ready";
    case "failed":
      return `Failed while ${phaseLabel(op).toLowerCase()}`;
    case "interrupted":
      return "Interrupted by a backend restart";
    default:
      return phaseLabel(op);
  }
}

export interface OperationGroups {
  running: Operation[];
  attention: Operation[];
  done: Operation[];
}

export function groupOperations(ops: Operation[]): OperationGroups {
  const groups: OperationGroups = { running: [], attention: [], done: [] };
  for (const op of ops) {
    if (op.status === "running") groups.running.push(op);
    else if (needsAttention(op)) groups.attention.push(op);
    else groups.done.push(op);
  }
  return groups;
}

/** What the compact sidebar bar lists, most urgent first. */
export function compactOperations(ops: Operation[], now: number): Operation[] {
  const { running, attention, done } = groupOperations(ops);
  const recent = done.filter(
    (op) =>
      op.finished_at !== null &&
      now - Date.parse(op.finished_at) < RECENT_SUCCESS_MS,
  );
  return [...running, ...attention, ...recent];
}

/** Mean fraction across running operations, null when none is measurable. */
export function aggregateFraction(ops: Operation[]): number | null {
  let sum = 0;
  let count = 0;
  for (const op of ops) {
    if (op.status !== "running") continue;
    const f = phaseFraction(op);
    if (f === null) continue;
    sum += f;
    count += 1;
  }
  return count ? sum / count : null;
}
