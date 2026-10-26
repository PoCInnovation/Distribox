import { Loader2, MoreHorizontal, PanelRight, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { VirtualMachineMetadata } from "@/lib/types";
import { useVmActions, type VmAction } from "@/hooks/useVmActions";

function ActionItem({ action }: { action: VmAction }) {
  const Icon = action.icon;
  return (
    <DropdownMenuItem
      disabled={!action.enabled}
      aria-disabled={!action.enabled}
      onSelect={() => action.run()}
      className="flex flex-col items-start gap-0.5 py-1.5 data-[disabled]:pointer-events-auto data-[disabled]:opacity-100"
    >
      <span className={cn("flex items-center gap-2", !action.enabled && "text-muted-foreground")}>
        {action.pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
        {action.label}
      </span>
      {!action.enabled && action.reason && (
        <span className="pl-6 text-[11px] leading-tight text-muted-foreground/80">
          {action.reason}
        </span>
      )}
    </DropdownMenuItem>
  );
}

/**
 * ⋮ menu for a participant. Power actions come from `useVmActions` like the
 * VM table; removing goes through the event so the seat is freed.
 */
export function ParticipantMenu({
  name,
  vm,
  onOpen,
  onRemove,
  className,
}: {
  name: string;
  vm: VirtualMachineMetadata;
  onOpen: () => void;
  /** Undefined when the user may not remove participants. */
  onRemove?: () => void;
  className?: string;
}) {
  const { byId } = useVmActions(vm);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${name}`}
          data-no-row-click="true"
          className={cn(
            "text-muted-foreground hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground",
            className,
          )}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 border-border bg-popover p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onOpen}>
          <PanelRight className="size-4" />
          Open details
        </DropdownMenuItem>
        <ActionItem action={byId.connect} />
        <ActionItem action={byId.start} />
        <ActionItem action={byId.stop} />
        <ActionItem action={byId.restart} />
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <UserMinus className="size-4 text-destructive" />
              Remove from event
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
