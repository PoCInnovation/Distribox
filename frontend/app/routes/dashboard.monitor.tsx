import { VmMonitorGrid } from "@/components/dashboard/vm-monitor-grid";

export default function MonitorRoute() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Monitor
        </h1>
        <p className="text-sm text-muted-foreground">
          Live view of all virtual machines. Click a running VM to connect.
        </p>
      </div>
      <VmMonitorGrid />
    </div>
  );
}
