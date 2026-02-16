import { HostInfoPanel } from "./host-info";
import { DashboardVMsTableContainer } from "./vms-table-container";

export default function OverviewPage() {
  return (
    <div className="h-full p-8 mb-10">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground">
          Monitor and manage your virtual machines
        </p>
      </div>

      <HostInfoPanel />

      <DashboardVMsTableContainer />
    </div>
  );
}
