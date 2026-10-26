import { useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";
import { getAuthToken } from "@/lib/api/core";

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** "UTC+1", "UTC-4", "" when unknown. */
export function getUtcOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return offset.replace("GMT", "UTC");
  } catch {
    return "";
  }
}

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Montreal",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Bucharest",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

/** Every IANA timezone the browser knows, or a curated list when it can't tell. */
export function listTimezones(): string[] {
  try {
    const all = Intl.supportedValuesOf("timeZone");
    if (all.length > 0) return all;
  } catch {
    // older engines
  }
  return FALLBACK_TIMEZONES;
}

/**
 * Returns the effective IANA timezone string based on user settings.
 * "auto" resolves to the browser's timezone.
 * Falls back to browser timezone when not authenticated.
 */
export function useTimezone(): string {
  const isAuthenticated = !!getAuthToken();
  const { data: settings } = useSettings(isAuthenticated);

  return useMemo(() => {
    const tz = settings?.timezone;
    if (!tz || tz === "auto") return getBrowserTimezone();
    return tz;
  }, [settings?.timezone]);
}

/** Format a date/datetime string using the given IANA timezone. */
export function formatDateTime(
  dateStr: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

/** Format a date-only string using the given IANA timezone. */
export function formatDateOnly(
  dateStr: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

/** "just now", "8 s ago", "3 min ago", "2 h ago", "3 d ago", "1 mo ago". */
export function formatRelative(dateStr: string, now = Date.now()): string {
  const diff = now - new Date(dateStr).getTime();
  if (diff < 5_000) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d} d ago`;
  const mo = Math.floor(d / 30);
  return `${mo} mo ago`;
}
