import { VMState, type VirtualMachineMetadata } from "~/lib/types";
import { Badge } from "@/components/ui/badge";

function badgeColor(state: VMState): string {
  switch (state) {
    case VMState.RUNNING:
      return "border-chart-3 bg-chart-3/10 text-chart-3";
    case VMState.PAUSED:
    case VMState.STOPPED:
      return "border-muted bg-muted/10 text-muted-foreground";
    case VMState.CRASHED:
    case VMState.BLOCKED:
      return "border-destructive bg-destructive/10 text-destructive";
    case VMState.SHUTDOWN:
      return "border-yellow-400 bg-yellow-400/10 text-yellow-400";
    case VMState.PMSUSPENDED:
      return "border-accent bg-accent/10 text-accent";
    case VMState.NOSTATE:
      return "border-muted bg-muted/10 text-muted-foreground";
  }
}

export const TableStateColumn = ({
  data: vm,
  operatingVMs,
}: {
  data?: VirtualMachineMetadata;
  operatingVMs: Set<string>;
}) => {
  if (!vm) return null;
  const isOperating = operatingVMs.has(vm.id);
  return (
    <div className="h-full flex items-center py-2">
      {isOperating ? (
        <Badge variant="default" className={badgeColor(vm.state)}>
          <div className="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          processing
        </Badge>
      ) : (
        <Badge variant="default" className={badgeColor(vm.state)}>
          {vm.state}
        </Badge>
      )}
    </div>
  );
};
