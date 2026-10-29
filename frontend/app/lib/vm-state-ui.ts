import { VMState } from "@/lib/types";

export type StateTone =
  "success" | "muted" | "warning" | "destructive" | "accent";

export interface StateUi {
  label: string;
  tone: StateTone;
  /** The VM is between two stable states; show it as in progress. */
  transitional: boolean;
}

export function getStateUi(state: VMState): StateUi {
  switch (state) {
    case VMState.RUNNING:
      return { label: "Running", tone: "success", transitional: false };
    case VMState.STOPPED:
      return { label: "Stopped", tone: "muted", transitional: false };
    case VMState.SHUTDOWN:
      return { label: "Stopping", tone: "warning", transitional: true };
    case VMState.PAUSED:
      return { label: "Paused", tone: "warning", transitional: false };
    case VMState.PMSUSPENDED:
      return { label: "Suspended", tone: "accent", transitional: false };
    case VMState.BLOCKED:
      return {
        label: "Blocked on I/O",
        tone: "destructive",
        transitional: false,
      };
    case VMState.CRASHED:
      return { label: "Crashed", tone: "destructive", transitional: false };
    case VMState.NOSTATE:
      return { label: "No state", tone: "muted", transitional: true };
    case VMState.UNKNOWN:
    default:
      return { label: "Unknown", tone: "muted", transitional: false };
  }
}

export function isTransitional(state: VMState): boolean {
  return getStateUi(state).transitional;
}

export function canConnect(state: VMState): boolean {
  return state === VMState.RUNNING || state === VMState.PMSUSPENDED;
}

/** Coarse buckets for the status filter in the table toolbar. */
export type StatusBucket = "running" | "stopped" | "other";

export function getStatusBucket(state: VMState): StatusBucket {
  if (state === VMState.RUNNING) return "running";
  if (state === VMState.STOPPED) return "stopped";
  return "other";
}
