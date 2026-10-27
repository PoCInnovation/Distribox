import { useEffect, useState } from "react";
import { FRONTEND_URL } from "@/lib/api";
import type { Event } from "@/lib/types/event";
import type { StateTone } from "@/lib/vm-state-ui";

/** Joining stays open but the deadline is close enough to warn about. */
export const CLOSING_SOON_MS = 6 * 3600_000;

export type EventPhase = "open" | "closing" | "full" | "ended";

export interface EventPhaseUi {
  phase: EventPhase;
  label: string;
  tone: StateTone;
  /** Pulse the dot: something is about to change. */
  pulsing: boolean;
  /** The public link still hands out machines. */
  joinable: boolean;
}

export function getEventPhase(event: Event, now: Date): EventPhaseUi {
  const left = new Date(event.deadline).getTime() - now.getTime();
  if (left <= 0) {
    return {
      phase: "ended",
      label: "Ended",
      tone: "muted",
      pulsing: false,
      joinable: false,
    };
  }
  if (event.participants_count >= event.max_vms) {
    return {
      phase: "full",
      label: "Full",
      tone: "warning",
      pulsing: false,
      joinable: false,
    };
  }
  if (left <= CLOSING_SOON_MS) {
    return {
      phase: "closing",
      label: "Closing soon",
      tone: "warning",
      pulsing: true,
      joinable: true,
    };
  }
  return {
    phase: "open",
    label: "Open",
    tone: "success",
    pulsing: false,
    joinable: true,
  };
}

/** "2d 23h", "2h 40m", "12m"; never negative. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/** "closes in 2d 23h" / "ended 9d ago". */
export function deadlineText(deadline: string, now: Date): string {
  const diff = new Date(deadline).getTime() - now.getTime();
  return diff > 0
    ? `in ${formatDuration(diff)}`
    : `${formatDuration(-diff).split(" ")[0]} ago`;
}

/** "7h ago", "3d ago", "just now". */
export function timeAgo(date: string, now: Date): string {
  const diff = now.getTime() - new Date(date).getTime();
  if (diff < 60_000) return "just now";
  return `${formatDuration(diff).split(" ")[0]} ago`;
}

export function eventShareUrl(slug: string): string {
  return `${FRONTEND_URL}/events/${slug}`;
}

/** The URL without its scheme, for display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
