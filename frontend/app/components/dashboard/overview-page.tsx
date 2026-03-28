import { useState } from "react";
import { HostInfoPanel } from "./host-info";
import { DashboardVMsTableContainer } from "./vms-table-container";
import { Policy } from "@/lib/types";
import { PolicyGate } from "@/components/policy/policy-gate";
import { RecoveryContainer } from "@/components/recovery/recovery-container";
import { useSlaves } from "@/hooks/useSlaves";
import { Server } from "lucide-react";

export default function OverviewPage() {
  const { slaves } = useSlaves();
  const onlineSlaves = slaves.filter((s) => s.status === "online");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div className="h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground">
          Monitor and manage your virtual machines
        </p>
      </div>

      <RecoveryContainer />

      <PolicyGate
        requiredPolicies={[Policy.HOST_GET]}
        title="Host Resources Hidden"
      >
        {onlineSlaves.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                selectedNodeId === null
                  ? "border border-primary/40 bg-primary/10 text-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Server className="h-4 w-4" />
              Master
            </button>
            {onlineSlaves.map((slave) => (
              <button
                key={slave.id}
                type="button"
                onClick={() => setSelectedNodeId(slave.id)}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                  selectedNodeId === slave.id
                    ? "border border-primary/40 bg-primary/10 text-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Server className="h-4 w-4" />
                {slave.name}
              </button>
            ))}
          </div>
        )}
        <HostInfoPanel slaveId={selectedNodeId} />
      </PolicyGate>

      <PolicyGate
        requiredPolicies={[Policy.VMS_GET]}
        title="Virtual Machines Hidden"
      >
        <DashboardVMsTableContainer />
      </PolicyGate>
    </div>
  );
}
