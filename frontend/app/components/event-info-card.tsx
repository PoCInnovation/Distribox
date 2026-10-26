import { cn } from "@/lib/utils";
import { DistroLogo } from "@/components/distro-logo";
import { useTimezone, formatDateTime } from "@/hooks/useTimezone";
import { resolveOsInfo } from "@/lib/vm-os";
import type { Event } from "@/lib/types/event";
import {
  deadlineText,
  useNow,
} from "@/components/dashboard/events/event-model";

/**
 * What a participant gets, as a two-column ledger. Public page: no image
 * registry lookup, the OS label comes from the image file name.
 */
export function EventInfoCard({
  event,
  className,
}: {
  event: Event;
  className?: string;
}) {
  const timeZone = useTimezone();
  const now = useNow(30_000);
  const os = resolveOsInfo(event.vm_os, undefined);
  const distribution = event.vm_distribution || os.distribution;
  const left = Math.max(0, event.max_vms - event.participants_count);
  const ended = new Date(event.deadline) <= now;

  return (
    <dl
      className={cn(
        "grid grid-cols-[max-content_minmax(0,1fr)] border border-border bg-card text-sm",
        "[&>dt]:border-b [&>dt]:border-border [&>dd]:border-b [&>dd]:border-border [&>dt:last-of-type]:border-b-0 [&>dd:last-of-type]:border-b-0",
        className,
      )}
    >
      <dt className="px-4 py-2.5 text-muted-foreground">Machine</dt>
      <dd className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
        <DistroLogo distribution={distribution} className="size-6 bg-secondary" />
        <span className="truncate">{os.label}</span>
      </dd>

      <dt className="px-4 py-2.5 text-muted-foreground">Size</dt>
      <dd className="flex flex-wrap gap-x-2 px-4 py-2.5 font-mono tabular-nums">
        <span className="whitespace-nowrap">{event.vm_vcpus} vCPU</span>
        <span className="text-border">/</span>
        <span className="whitespace-nowrap">{event.vm_mem} GB memory</span>
        <span className="text-border">/</span>
        <span className="whitespace-nowrap">{event.vm_disk_size} GB disk</span>
      </dd>

      <dt className="px-4 py-2.5 text-muted-foreground">
        {ended ? "Joining closed" : "Joining closes"}
      </dt>
      <dd className="px-4 py-2.5">
        <span className="font-mono tabular-nums">
          {formatDateTime(event.deadline, timeZone)}
        </span>
        <span className="ml-2 whitespace-nowrap text-muted-foreground">
          {deadlineText(event.deadline, now)}
        </span>
      </dd>

      <dt className="px-4 py-2.5 text-muted-foreground">Seats</dt>
      <dd className="px-4 py-2.5">
        <span className="font-mono tabular-nums">
          {left}
          <span className="text-muted-foreground"> of {event.max_vms}</span>
        </span>
        <span className="ml-2 text-muted-foreground">left</span>
      </dd>
    </dl>
  );
}
