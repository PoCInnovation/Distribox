import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Event } from "@/lib/types/event";
import { useTimezone, formatDateTime } from "@/hooks/useTimezone";
import { VmOsLabel } from "../vm-os-label";
import { ShareLink, SpecSummary } from "./event-bits";
import { deadlineText, eventShareUrl, useNow } from "./event-model";

/**
 * Full-screen view of the join link for a projector: the event name and
 * the URL as large as they fit, plus the few facts people ask about.
 */
export function PresentOverlay({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
}) {
  const now = useNow(15_000);
  const timeZone = useTimezone();
  const url = eventShareUrl(event.slug);
  const seatsLeft = Math.max(0, event.max_vms - event.participants_count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Join link for ${event.name}`}
      className="bg-brand-gradient animate-in fade-in-0 fixed inset-0 z-50 flex flex-col overflow-auto bg-background duration-200"
    >
      <header className="flex items-center justify-between px-8 py-6 md:px-12">
        <span className="inline-flex items-center gap-3">
          <img src="/favicon.ico" width={36} height={36} alt="" />
          <span className="font-mono text-xl font-semibold tracking-[0.14em]">
            DISTRIBOX
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-2 border border-border/80 bg-background/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
        >
          <X className="size-4" />
          Close
          <kbd className="ml-1 border border-border px-1 font-mono text-[11px]">
            Esc
          </kbd>
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-8 pb-16 md:px-12">
        <h1 className="font-mono text-4xl font-bold tracking-tight text-balance md:text-6xl">
          {event.name}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-foreground/75 md:text-xl">
          Open this link and enter your name. You get your own machine in the
          browser.
        </p>

        <ShareLink url={url} size="lg" className="mt-10 bg-background/70" />

        <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Machine</dt>
            <dd className="mt-2 space-y-1.5">
              <VmOsLabel
                image={event.vm_os}
                className="[&_.text-sm]:text-base"
              />
              <SpecSummary
                vcpus={event.vm_vcpus}
                mem={event.vm_mem}
                disk={event.vm_disk_size}
              />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Joining closes</dt>
            <dd className="mt-2">
              <span className="block font-mono text-2xl tabular-nums">
                {deadlineText(event.deadline, now)}
              </span>
              <span className="block text-sm text-muted-foreground">
                {formatDateTime(event.deadline, timeZone)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Seats left</dt>
            <dd className="mt-2">
              <span className="block font-mono text-2xl tabular-nums">
                {seatsLeft}
                <span className="text-muted-foreground">
                  {" "}
                  / {event.max_vms}
                </span>
              </span>
              <span className="block text-sm text-muted-foreground">
                {event.participants_count} joined so far
              </span>
            </dd>
          </div>
        </dl>
      </main>
    </div>,
    document.body,
  );
}
