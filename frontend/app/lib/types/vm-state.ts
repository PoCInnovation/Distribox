import { z } from "zod";

export enum VMState {
  NOSTATE = "No state",
  RUNNING = "Running",
  BLOCKED = "Blocked on I/O",
  PAUSED = "Paused",
  SHUTDOWN = "Stopping",
  STOPPED = "Stopped",
  CRASHED = "Crashed",
  PMSUSPENDED = "Suspended (power management)",
  UNKNOWN = "Unknown",
}

export const VMStateSchema = z.nativeEnum(VMState);
