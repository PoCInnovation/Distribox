import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Operation } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useNow,
  useOperationOutcomes,
  useOperations,
} from "@/hooks/useOperations";
import { ActivityPanel } from "./activity-panel";
import {
  ProgressRing,
  SegmentedProgress,
  StatusGlyph,
} from "./operation-progress";
import {
  aggregateFraction,
  compactOperations,
  formatEta,
  groupOperations,
  outcomeLabel,
  phaseEtaSeconds,
  phaseFraction,
  phaseLabel,
} from "./operation-model";

const MAX_ROWS = 3;

function summary(ops: Operation[]): string {
  const { running, attention } = groupOperations(ops);
  const parts = [];
  if (running.length) parts.push(`${running.length} running`);
  if (attention.length) parts.push(`${attention.length} failed`);
  return parts.join(" · ") || "All done";
}

/**
 * Sidebar entry for long-running operations. It shows what is in progress,
 * what failed and what just finished, and opens the full list on click.
 * It is mounted on every dashboard page, so it also owns the reaction to
 * operations finishing (refreshing the VM list, toasts).
 */
export function ActivityBar({ collapsed }: { collapsed: boolean }) {
  const { operations } = useOperations();
  useOperationOutcomes(operations);
  const [open, setOpen] = useState(false);
  const running = operations.some((op) => op.status === "running");
  const now = useNow(running || open);

  if (operations.length === 0) return null;

  const compact = compactOperations(operations, now);
  const label = summary(operations);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {collapsed ? (
        <CollapsedTrigger operations={operations} label={label} />
      ) : (
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Activity: ${label}`}
            className={cn(
              "group block w-full border border-sidebar-border/80 bg-sidebar-accent/20 text-left transition-colors",
              "hover:border-sidebar-border hover:bg-sidebar-accent/40 data-[state=open]:border-sidebar-primary/40 data-[state=open]:bg-sidebar-accent/40",
              "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
            )}
          >
            <div className="flex h-8 items-center gap-2 px-3">
              <LiveDot operations={operations} />
              <span className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/55">
                Activity
              </span>
              <span className="ml-auto font-mono text-[11px] text-sidebar-foreground/60 tabular-nums">
                {label}
              </span>
              <ChevronRight className="size-3.5 text-sidebar-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-sidebar-foreground/80 group-data-[state=open]:text-sidebar-primary" />
            </div>
            {compact.length > 0 && (
              <ul className="space-y-3 px-3 pt-1 pb-3">
                {compact.slice(0, MAX_ROWS).map((op) => (
                  <CompactRow key={op.id} op={op} />
                ))}
              </ul>
            )}
            {compact.length > MAX_ROWS && (
              <div className="border-t border-sidebar-border/60 px-3 py-1.5 text-[11px] text-sidebar-foreground/50">
                +{compact.length - MAX_ROWS} more
              </div>
            )}
          </button>
        </PopoverTrigger>
      )}
      <PopoverContent
        side="right"
        align="end"
        sideOffset={14}
        collisionPadding={12}
        className="w-[26rem] border-border bg-popover p-0 shadow-2xl shadow-black/40"
      >
        <ActivityPanel
          operations={operations}
          now={now}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function LiveDot({ operations }: { operations: Operation[] }) {
  const { running, attention } = groupOperations(operations);
  const tone = running.length
    ? "bg-sidebar-primary"
    : attention.length
      ? "bg-destructive"
      : "bg-success";
  return (
    <span className="relative inline-flex size-1.5">
      {running.length > 0 && (
        <span
          className={cn(
            "animate-status-ping absolute inset-0 rounded-full",
            tone,
          )}
        />
      )}
      <span
        className={cn("relative inline-flex size-1.5 rounded-full", tone)}
      />
    </span>
  );
}

function CompactRow({ op }: { op: Operation }) {
  const fraction = phaseFraction(op);
  const eta = phaseEtaSeconds(op);
  const isRunning = op.status === "running";

  let detail: string;
  if (isRunning) {
    detail = phaseLabel(op);
    if (eta !== null) detail += ` · ${formatEta(eta)}`;
  } else {
    detail = outcomeLabel(op);
  }

  return (
    <li className="min-w-0">
      <div className="flex items-center gap-2">
        <StatusGlyph op={op} />
        <span className="min-w-0 truncate font-mono text-[12.5px] font-medium text-sidebar-foreground">
          {op.name}
        </span>
        {isRunning && fraction !== null && (
          <span className="ml-auto font-mono text-[11px] text-sidebar-foreground/70 tabular-nums">
            {Math.floor(fraction * 100)}%
          </span>
        )}
      </div>
      {isRunning && <SegmentedProgress op={op} className="mt-1.5" />}
      <p
        className={cn(
          "mt-1 truncate text-[11px]",
          op.status === "failed"
            ? "text-destructive/90"
            : op.status === "interrupted"
              ? "text-warning/90"
              : "text-sidebar-foreground/50",
        )}
      >
        {detail}
      </p>
    </li>
  );
}

function CollapsedTrigger({
  operations,
  label,
}: {
  operations: Operation[];
  label: string;
}) {
  const { running, attention } = groupOperations(operations);
  const fraction = aggregateFraction(operations);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Activity: ${label}`}
            className="animate-in fade-in-0 relative mx-auto flex size-12 items-center justify-center text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50 data-[state=open]:bg-sidebar-accent/50"
          >
            {running.length > 0 ? (
              <>
                <ProgressRing fraction={fraction} size={32} />
                <span className="absolute font-mono text-[11px] font-medium tabular-nums">
                  {running.length}
                </span>
              </>
            ) : (
              <ProgressRing
                fraction={1}
                size={32}
                tone={attention.length ? "destructive" : "success"}
              />
            )}
            {attention.length > 0 && running.length > 0 && (
              <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-sidebar" />
            )}
          </button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        Activity · {label}
      </TooltipContent>
    </Tooltip>
  );
}
