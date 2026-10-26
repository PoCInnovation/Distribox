import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StateTone } from "@/lib/vm-state-ui";
import { copyToClipboard } from "@/components/ui/secret-field";
import type { EventPhaseUi } from "./event-model";
import { displayUrl } from "./event-model";
import { DistroLogo } from "@/components/distro-logo";
import { useOsInfo } from "../vm-os-label";

const DOT_TONE: Record<StateTone, string> = {
  success: "bg-success",
  muted: "bg-muted-foreground/60",
  warning: "bg-warning",
  destructive: "bg-destructive",
  accent: "bg-accent",
};

const TEXT_TONE: Record<StateTone, string> = {
  success: "text-success",
  muted: "text-muted-foreground",
  warning: "text-warning",
  destructive: "text-destructive",
  accent: "text-accent",
};

/** Dot + label, the same shape as `VmStatus`. */
export function EventStatus({
  ui,
  className,
}: {
  ui: EventPhaseUi;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-sm",
        className,
      )}
    >
      <span className="relative inline-flex size-3.5 items-center justify-center">
        {ui.pulsing && (
          <span
            className={cn(
              "animate-status-ping absolute inline-flex size-2 rounded-full",
              DOT_TONE[ui.tone],
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            DOT_TONE[ui.tone],
          )}
        />
      </span>
      <span
        className={cn(
          ui.phase === "open" ? "text-foreground/90" : TEXT_TONE[ui.tone],
        )}
      >
        {ui.label}
      </span>
    </span>
  );
}

/** "8 / 30" over a thin bar; amber once full. */
export function SeatMeter({
  used,
  total,
  dimmed = false,
  className,
}: {
  used: number;
  total: number;
  dimmed?: boolean;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const full = used >= total;
  return (
    <div className={cn("min-w-0", dimmed && "opacity-60", className)}>
      <span className="font-mono text-[13px] tabular-nums text-foreground">
        {used}
        <span className="text-muted-foreground"> / {total}</span>
      </span>
      <div
        className="mt-1.5 h-1 w-full bg-border/60"
        role="meter"
        aria-label="Seats taken"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
      >
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            full ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** "2 vCPU 4 GB 20 GB" with muted units, like the VM table resources cell. */
export function SpecSummary({
  vcpus,
  mem,
  disk,
  className,
}: {
  vcpus: number;
  mem: number;
  disk: number;
  className?: string;
}) {
  const unit = "ml-0.5 text-[11px] text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-2.5 font-mono text-[13px] tabular-nums",
        className,
      )}
    >
      <span>
        {vcpus}
        <span className={unit}>vCPU</span>
      </span>
      <span>
        {mem}
        <span className={unit}>GB</span>
      </span>
      <span>
        {disk}
        <span className={unit}>GB disk</span>
      </span>
    </span>
  );
}

/**
 * The public join link: the URL in mono with copy and open buttons. Used on
 * the detail page and the present overlay.
 */
export function ShareLink({
  url,
  className,
  size = "md",
}: {
  url: string;
  className?: string;
  size?: "md" | "lg";
}) {
  const [copied, setCopied] = useState(false);
  const path = displayUrl(url);
  const slash = path.indexOf("/");
  const host = slash >= 0 ? path.slice(0, slash) : path;
  const rest = slash >= 0 ? path.slice(slash) : "";
  const button =
    size === "lg"
      ? "flex size-14 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      : "flex size-9 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div
      className={cn(
        "flex min-w-0 items-stretch border border-border bg-background",
        className,
      )}
    >
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center truncate px-3 font-mono",
          size === "lg" ? "px-5 text-2xl md:text-3xl" : "text-[13px]",
        )}
        title={url}
      >
        <span className="text-muted-foreground">{host}</span>
        <span className="truncate text-foreground">{rest}</span>
      </span>
      <button
        type="button"
        className={button}
        aria-label="Copy join link"
        title="Copy join link"
        onClick={() => {
          copyToClipboard(url, "Join link copied");
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? (
          <Check className={cn(size === "lg" ? "size-5" : "size-4", "text-success")} />
        ) : (
          <Copy className={size === "lg" ? "size-5" : "size-4"} />
        )}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={button}
        aria-label="Open join page"
        title="Open join page"
      >
        <ExternalLink className={size === "lg" ? "size-5" : "size-4"} />
      </a>
    </div>
  );
}

/** Distro logo, friendly image name and the per-VM size on a second line. */
export function EventMachine({
  image,
  vcpus,
  mem,
  disk,
  className,
}: {
  image: string;
  vcpus: number;
  mem: number;
  disk: number;
  className?: string;
}) {
  const os = useOsInfo(image);
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <DistroLogo distribution={os.distribution} className="size-7 shrink-0 bg-secondary" />
      <span className="min-w-0">
        <span className="block truncate text-sm" title={os.image}>
          {os.label}
        </span>
        <SpecSummary vcpus={vcpus} mem={mem} disk={disk} className="text-xs text-muted-foreground [&>span]:text-foreground/80" />
      </span>
    </span>
  );
}
