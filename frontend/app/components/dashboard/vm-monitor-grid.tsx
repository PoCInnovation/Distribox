import { useQuery } from "@tanstack/react-query";
import { getVMs } from "@/lib/api";
import type { VirtualMachineMetadata } from "@/lib/types";
import { VMState } from "@/lib/types";
import { VmMonitorTile } from "./vm-monitor-tile";
import { Monitor } from "lucide-react";

const VM_LIST_POLL_INTERVAL = 5000;

export function VmMonitorGrid() {
  const {
    data: vms,
    isLoading,
    isError,
    error,
  } = useQuery<VirtualMachineMetadata[]>({
    queryKey: ["vms"],
    queryFn: getVMs,
    refetchInterval: VM_LIST_POLL_INTERVAL,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading VMs...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        Failed to load VMs: {error?.message ?? "Unknown error"}
      </div>
    );
  }

  if (!vms || vms.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Monitor className="h-10 w-10" />
        <p>No virtual machines found</p>
      </div>
    );
  }

  const sorted = [...vms].sort((a, b) => {
    const aRunning = a.state === VMState.RUNNING ? 0 : 1;
    const bRunning = b.state === VMState.RUNNING ? 0 : 1;
    if (aRunning !== bRunning) return aRunning - bRunning;
    return a.name.localeCompare(b.name);
  });

  const count = sorted.length;
  const gridClass =
    count === 1
      ? "grid grid-cols-1 gap-4 max-w-7xl mx-auto"
      : count <= 4
        ? "grid grid-cols-1 gap-4 md:grid-cols-2"
        : count <= 9
          ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          : "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className={gridClass}>
      {sorted.map((vm) => (
        <VmMonitorTile key={vm.id} vm={vm} />
      ))}
    </div>
  );
}
