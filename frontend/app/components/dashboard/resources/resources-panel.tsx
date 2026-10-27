import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSlaves } from "@/hooks/useSlaves";
import { useTargetHostInfo } from "@/hooks/useHostInfo";
import { isForbiddenError } from "@/lib/api";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { cn } from "@/lib/utils";
import {
  NodeSwitch,
  useHistory,
  useNodeVms,
  useTopVms,
  type NodeOption,
} from "./shared";
import { ResourcesCharts } from "./charts";
import { ResourcesDetails } from "./details";

const DETAILS_KEY = "distribox.resources.details";

/** Live load of one node: charts, with per-core and per-VM detail on demand. */
export function ResourcesPanel() {
  const { slaves } = useSlaves();
  const nodes: NodeOption[] = [
    { id: null, name: "master" },
    ...slaves
      .filter((s) => s.status === "online")
      .map((s) => ({ id: s.id, name: s.name })),
  ];
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { data: hostInfo, isError, error } = useTargetHostInfo(nodeId);
  const history = useHistory(hostInfo, nodeId ?? "master");
  const { vms, running } = useNodeVms(nodeId);
  const topVms = useTopVms(hostInfo, vms);

  // Remember whether the details were left open.
  useEffect(() => {
    setDetailsOpen(localStorage.getItem(DETAILS_KEY) === "1");
  }, []);
  const toggleDetails = () => {
    localStorage.setItem(DETAILS_KEY, detailsOpen ? "0" : "1");
    setDetailsOpen(!detailsOpen);
  };

  if (isError && isForbiddenError(error)) {
    return (
      <PolicyNotice
        title="Host Resources Hidden"
        missingPolicies={error.missingPolicies}
      />
    );
  }

  if (isError) {
    return (
      <PolicyNotice
        title="Host Resources Unavailable"
        description={error instanceof Error ? error.message : "Unknown error"}
        missingPolicies={[]}
      />
    );
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <NodeSwitch nodes={nodes} value={nodeId} onChange={setNodeId} />
        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={toggleDetails}
          disabled={!hostInfo}
          className={cn(
            "ml-auto flex h-8 items-center gap-1.5 border border-border px-3 text-sm transition-colors disabled:opacity-50",
            detailsOpen
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          Details
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              detailsOpen && "rotate-180",
            )}
          />
        </button>
      </div>

      <ResourcesCharts hostInfo={hostInfo} history={history} />

      {detailsOpen && hostInfo && (
        <div className="mt-3">
          <ResourcesDetails
            hostInfo={hostInfo}
            topVms={topVms}
            running={running}
          />
        </div>
      )}
    </section>
  );
}
