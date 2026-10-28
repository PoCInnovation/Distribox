import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";
import { getStateUi, type StateTone } from "@/lib/vm-state-ui";
import { PENDING_LABELS } from "@/hooks/useVmActions";
import type { VmOperation } from "@/hooks/useVMs";

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

export function VmStatus({
  vm,
  pendingOp,
  size = "sm",
  className,
}: {
  vm: VirtualMachineMetadata;
  pendingOp?: VmOperation;
  size?: "sm" | "md";
  className?: string;
}) {
  const ui = getStateUi(vm.state);
  const busy = !!pendingOp || ui.transitional;
  const label =
    pendingOp === "start" && vm.state === VMState.PAUSED
      ? "Resuming…"
      : pendingOp
        ? PENDING_LABELS[pendingOp]
        : ui.label;
  const tone: StateTone = pendingOp ? "warning" : ui.tone;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap",
        size === "sm" ? "text-sm" : "text-base",
        className,
      )}
      aria-live={busy ? "polite" : undefined}
    >
      {pendingOp ? (
        <Loader2 className={cn("size-3.5 animate-spin", TEXT_TONE[tone])} />
      ) : (
        <span className="relative inline-flex size-3.5 items-center justify-center">
          {ui.transitional && (
            <span
              className={cn(
                "animate-status-ping absolute inline-flex size-2 rounded-full",
                DOT_TONE[tone],
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              DOT_TONE[tone],
            )}
          />
        </span>
      )}
      <span className={cn(busy ? TEXT_TONE[tone] : "text-foreground/90")}>
        {label}
        {!pendingOp && vm.state === VMState.PAUSED && vm.pause_reason && (
          <span className="block whitespace-normal text-xs text-warning">
            {vm.pause_reason}
          </span>
        )}
      </span>
    </span>
  );
}
