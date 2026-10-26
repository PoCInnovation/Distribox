import { cn } from "@/lib/utils";
import type { Capacity } from "./node-model";

/**
 * One capacity figure: "6 / 16 vCPU" over a thin bar.
 * The bar turns amber past 80 % and red past 95 %, so a saturated node is
 * visible from across the list.
 */
export function CapacityBar({
  label,
  capacity,
  format,
  dimmed = false,
  className,
  ariaLabel,
}: {
  label: string;
  ariaLabel?: string;
  capacity: Capacity | null;
  format: (n: number) => string;
  dimmed?: boolean;
  className?: string;
}) {
  if (!capacity) {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          <span className="font-mono text-muted-foreground/70">—</span>
        </div>
        <div className="mt-1.5 h-1 w-full bg-border/60" />
      </div>
    );
  }

  const pct = Math.round(capacity.percent);
  const tone =
    pct >= 95 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";

  return (
    <div className={cn("min-w-0", dimmed && "opacity-60", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="truncate font-mono tabular-nums text-foreground">
          {format(capacity.used)}
          <span className="text-muted-foreground"> / {format(capacity.total)}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1 w-full bg-border/60"
        role="meter"
        aria-label={`${label || ariaLabel || "capacity"} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn("h-full transition-[width] duration-500", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
