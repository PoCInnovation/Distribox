import { Server } from "lucide-react";
import type { VirtualMachineMetadata } from "~/lib/types";

export const TableVMColumn = ({
  data: vm,
}: {
  data?: VirtualMachineMetadata;
}) => {
  if (!vm) return null;
  return (
    <div className="flex items-center gap-3 h-full py-2">
      <div className="flex h-10 w-10 items-center justify-center border border-border bg-secondary flex-shrink-0">
        <Server className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-mono font-medium">{vm.name}</p>
        <p className="text-xs text-muted-foreground">{vm.id}</p>
      </div>
    </div>
  );
};
