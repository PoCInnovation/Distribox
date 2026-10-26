import { CheckIcon, Sparkles, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeProblems,
  formatCapacity,
  type NodeFit,
  type VmSize,
} from "./model";

/**
 * A single capacity bar: what the node already uses, what this VM would
 * take (teal, or red when it does not fit), and what would stay free.
 */
function CapacityBar({
  label,
  total,
  free,
  requested,
  over,
}: {
  label: string;
  total: number;
  free: number;
  requested: number;
  over: boolean;
}) {
  const safeTotal = total > 0 ? total : Math.max(free, requested, 1);
  const usedPct = Math.max(0, Math.min(100, ((safeTotal - free) / safeTotal) * 100));
  const reqPct = Math.max(0, Math.min(100 - usedPct, (requested / safeTotal) * 100));
  const short = Math.max(0, requested - free);

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono tabular-nums",
            over ? "text-destructive" : "text-foreground/80",
          )}
        >
          {over
            ? `short by ${formatCapacity(short)}`
            : `${formatCapacity(free - requested)} left`}
        </span>
      </div>
      <div
        className="flex h-1.5 w-full overflow-hidden bg-muted"
        role="img"
        aria-label={`${label}: ${formatCapacity(requested)} of ${formatCapacity(free)} free`}
      >
        <div
          className="h-full bg-foreground/25"
          style={{ width: `${usedPct}%` }}
        />
        <div
          className={cn(
            "h-full transition-[width] duration-200",
            over ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${over ? 100 - usedPct : reqPct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * One node of the cluster, selectable as a placement target. Shows live
 * "does this VM fit here" feedback for the current size.
 */
export function NodeCard({
  fit,
  size,
  selected,
  predicted,
  onSelect,
  disabled,
}: {
  fit: NodeFit;
  size: VmSize;
  selected: boolean;
  predicted: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  const { node, fits, problems } = fit;
  const cpuOver = problems.includes("vcpus");
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-bold">
            {node.name}
          </span>
          {predicted && (
            <span className="inline-flex items-center gap-1 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <Sparkles className="h-3 w-3" />
              auto picks this
            </span>
          )}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
            fits ? "text-chart-3" : "text-destructive",
          )}
        >
          {fits ? (
            <CheckIcon className="h-3.5 w-3.5" />
          ) : (
            <TriangleAlertIcon className="h-3.5 w-3.5" />
          )}
          {fits ? "fits" : `not enough ${describeProblems(problems)}`}
        </span>
      </div>
      <div className="mt-3 grid gap-2.5">
        <CapacityBar
          label="Memory"
          total={node.memTotal}
          free={node.memFree}
          requested={size.mem}
          over={problems.includes("mem")}
        />
        <CapacityBar
          label="Disk"
          total={node.diskTotal}
          free={node.diskFree}
          requested={size.disk}
          over={problems.includes("disk")}
        />
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">CPU</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              cpuOver ? "text-destructive" : "text-foreground/80",
            )}
          >
            {size.vcpus} of {node.cpuCount} cores
          </span>
        </div>
      </div>
    </>
  );

  const className = cn(
    "block w-full min-w-0 border p-3 text-left transition-colors",
    selected
      ? "border-primary bg-primary/5"
      : "border-border bg-card hover:border-foreground/30",
    disabled && "pointer-events-none opacity-60",
  );

  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(className, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60")}
      onClick={onSelect}
      disabled={disabled}
    >
      {content}
    </button>
  );
}
