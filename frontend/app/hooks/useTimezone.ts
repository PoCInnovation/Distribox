import { useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";
import { getAuthToken } from "@/lib/api/core";

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
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
