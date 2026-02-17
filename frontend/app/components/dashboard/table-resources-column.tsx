import type { VirtualMachineMetadata } from "~/lib/types";

export const TableResourcesColumn = ({
  data: vm,
}: {
  data?: VirtualMachineMetadata;
}) => {
  if (!vm) return null;
  return (
    <div className="space-y-1 py-2">
      <p className="text-sm font-medium">{vm.os}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {vm.vcpus} vCPU • {vm.mem} GB RAM • {vm.disk_size} GB
      </p>
    </div>
  );
};
