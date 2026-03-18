import { VmMonitorGrid } from "@/components/dashboard/vm-monitor-grid";

export default function MonitorRoute() {
  return (
    <div className="h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Monitor
        </h1>
        <p className="text-muted-foreground">
          Live view of all virtual machines. Click a running VM to connect.
        </p>
      </div>
      <VmMonitorGrid />
    </div>
  );
}
