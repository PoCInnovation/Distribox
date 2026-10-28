import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";
import { useVmActions, type VmAction } from "@/hooks/useVmActions";

function ActionButton({
  action,
  variant = "outline",
  showLabel = false,
}: {
  action: VmAction;
  variant?: "outline" | "default" | "ghost";
  showLabel?: boolean;
}) {
  const Icon = action.icon;
  const button = (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? "sm" : "icon-sm"}
      aria-label={action.label}
      aria-disabled={!action.enabled}
      onClick={() => action.enabled && action.run()}
      className={cn(
        !action.enabled && "cursor-not-allowed opacity-45",
        action.destructive && "hover:bg-destructive/10 hover:text-destructive",
        action.destructive && action.enabled && "text-destructive",
      )}
    >
      {action.pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
      {showLabel && action.label}
    </Button>
  );

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-56 text-center">
        <span className="font-medium">{action.label}</span>
        {!action.enabled && action.reason && (
          <span className="block text-muted-foreground">{action.reason}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Full action strip for the drawer header. Connect is the primary button,
 * power actions sit together, destructive ones are pushed to the right.
 */
export function VmActionToolbar({
  vm,
  className,
}: {
  vm: VirtualMachineMetadata;
  className?: string;
}) {
  const { byId } = useVmActions(vm);
  const paused = vm.state === VMState.PAUSED;
  const primary = paused ? byId.start : byId.connect;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            aria-disabled={!primary.enabled}
            onClick={() => primary.enabled && primary.run()}
            className={cn(
              "mr-1.5 font-medium",
              !primary.enabled && "cursor-not-allowed opacity-45",
            )}
          >
            {primary.pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <primary.icon className="size-4" />
            )}
            {primary.pending && paused ? "Resuming…" : primary.label}
          </Button>
        </TooltipTrigger>
        {!primary.enabled && primary.reason && (
          <TooltipContent side="bottom">{primary.reason}</TooltipContent>
        )}
      </Tooltip>
      {!paused && <ActionButton action={byId.start} />}
      <ActionButton action={byId.stop} />
      <ActionButton action={byId.restart} />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ActionButton action={byId.duplicate} />
      <ActionButton action={byId.rename} />
      <span className="flex-1" />
      <ActionButton action={byId.delete} variant="ghost" />
    </div>
  );
}
