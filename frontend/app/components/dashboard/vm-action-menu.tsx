import { Loader2, MoreHorizontal } from "lucide-react";
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

function MenuItem({ action }: { action: VmAction }) {
  const Icon = action.icon;
  return (
    <DropdownMenuItem
      variant={action.destructive ? "destructive" : "default"}
      disabled={!action.enabled}
      aria-disabled={!action.enabled}
      onSelect={() => action.run()}
      className={cn(
        "flex flex-col items-start gap-0.5 py-1.5",
        // keep disabled items hoverable so the reason stays readable
        "data-[disabled]:pointer-events-auto data-[disabled]:opacity-100",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2",
          !action.enabled && "text-muted-foreground",
        )}
      >
        {action.pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Icon className={cn("size-4", action.destructive && "text-destructive")} />
        )}
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

/** The ⋮ menu for a VM. Items come from `useVmActions`, nothing is hidden. */
export function VmActionMenu({
  vm,
  className,
  align = "end",
}: {
  vm: VirtualMachineMetadata;
  className?: string;
  align?: "start" | "end";
}) {
  const { actions } = useVmActions(vm);
  const regular = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${vm.name}`}
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
        align={align}
        className="w-60 border-border bg-popover p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {regular.map((a) => (
          <MenuItem key={a.id} action={a} />
        ))}
        {destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map((a) => (
          <MenuItem key={a.id} action={a} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
