import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, ServerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useAuthz } from "@/contexts/authz-context";
import { useSlaves } from "@/hooks/useSlaves";
import { useClusterHostInfo } from "@/hooks/useHostInfo";
import { useTimezone } from "@/hooks/useTimezone";
import { getVMs } from "@/lib/api";
import { Policy } from "@/lib/types";
import { VMState } from "@/lib/types/vm-state";
import { cn } from "@/lib/utils";
import { CapacityBar } from "./nodes/capacity-bar";
import { DeleteNodeDialog } from "./nodes/delete-node-dialog";
import {
  buildClusterNodes,
  formatGb,
  type Capacity,
  type ClusterNode,
} from "./nodes/node-model";
import { NODE_GRID, NodeRow } from "./nodes/node-row";
import { RegisterNodeDialog } from "./nodes/register-node-dialog";
import { SlaveSetupGuide } from "./nodes/setup-guide";

function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SlavesPage() {
  const authz = useAuthz();
  const canCreate = authz.hasPolicy(Policy.SLAVES_CREATE);
  const canDelete = authz.hasPolicy(Policy.SLAVES_DELETE);
  const canReadHost = authz.hasPolicy(Policy.HOST_GET);
  const canReadVms = authz.hasPolicy(Policy.VMS_GET);

  const {
    slaves,
    isLoading,
    forbidden,
    error,
    createSlave,
    isCreating,
    deleteSlave,
    isDeleting,
  } = useSlaves();
  const cluster = useClusterHostInfo(canReadHost && !forbidden, 10_000);
  const vmsQuery = useQuery({
    queryKey: ["vms"],
    queryFn: getVMs,
    enabled: canReadVms && !forbidden,
    retry: false,
    refetchInterval: 15_000,
  });
  const timezone = useTimezone();
  const now = useNow();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClusterNode | null>(null);

  const nodes = useMemo(
    () =>
      buildClusterNodes({
        slaves,
        cluster: cluster.data,
        vms: vmsQuery.data,
      }),
    [slaves, cluster.data, vmsQuery.data],
  );

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await deleteSlave(deleteTarget.id);
    toast.success(`${deleteTarget.name} unregistered`);
    setExpanded(null);
    setDeleteTarget(null);
  };

  if (forbidden) {
    return (
      <PolicyNotice
        title="Nodes are hidden"
        description="Listing cluster nodes needs a policy your account does not have."
        missingPolicies={forbidden.missingPolicies}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ClusterSummary
        nodes={nodes}
        isLoading={isLoading}
        vms={vmsQuery.data}
        onRegister={canCreate ? () => setRegisterOpen(true) : undefined}
        onGuide={() => setGuideOpen(true)}
        showActions={isLoading || slaves.length > 0}
      />

      {error && !forbidden && (
        <div className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span className="text-destructive">Could not load the node list.</span>{" "}
          <span className="text-muted-foreground">
            {error.message}. Retrying every 10 s.
          </span>
        </div>
      )}

      <section aria-label="Cluster nodes" className="border border-border">
        <div
          className={cn(
            NODE_GRID,
            "border-b border-border bg-background/60 px-5 py-2 text-[11px] text-muted-foreground",
          )}
        >
          <span className="pl-[3px]">Node</span>
          <span>Address</span>
          <span>vCPU used</span>
          <span>Memory used</span>
          <span>Disk used</span>
          <span className="text-right">VMs</span>
          <span />
        </div>
        <ul>
          {isLoading ? (
            <SkeletonRows />
          ) : (
            nodes.map((node) => {
              const key = node.id ?? "master";
              return (
                <NodeRow
                  key={key}
                  node={node}
                  expanded={expanded === key}
                  onToggle={() => setExpanded((e) => (e === key ? null : key))}
                  canDelete={canDelete}
                  onDelete={() => setDeleteTarget(node)}
                  timezone={timezone}
                  now={now}
                />
              );
            })
          )}
        </ul>
        {!isLoading && slaves.length === 0 && (
          <EmptySlaves
            onRegister={canCreate ? () => setRegisterOpen(true) : undefined}
            onGuide={() => setGuideOpen(true)}
          />
        )}
      </section>

      <RegisterNodeDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegister={createSlave}
        isRegistering={isCreating}
        existingNames={nodes.map((n) => n.name)}
        onOpenGuide={() => setGuideOpen(true)}
      />

      <DeleteNodeDialog
        node={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">Set up a slave node</DialogTitle>
            <DialogDescription>
              Six steps to turn another machine into a node of this cluster.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <SlaveSetupGuide />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function sumCapacity(nodes: ClusterNode[], pick: (n: ClusterNode) => Capacity | null) {
  let total = 0;
  let used = 0;
  let any = false;
  for (const node of nodes) {
    if (node.status !== "online") continue;
    const c = pick(node);
    if (!c) continue;
    any = true;
    total += c.total;
    used += c.used;
  }
  return any ? { total, used, percent: total ? (used / total) * 100 : 0, live: true } : null;
}

function ClusterSummary({
  nodes,
  isLoading,
  vms,
  onRegister,
  onGuide,
  showActions,
}: {
  nodes: ClusterNode[];
  isLoading: boolean;
  vms: { state: string }[] | undefined;
  onRegister?: () => void;
  onGuide: () => void;
  /** Hidden when the empty state below carries the same actions. */
  showActions: boolean;
}) {
  const online = nodes.filter((n) => n.status === "online").length;
  // Summed from the rows below so the strip always agrees with the list.
  const cpu = sumCapacity(nodes, (n) => n.cpu);
  const mem = sumCapacity(nodes, (n) => n.mem);
  const disk = sumCapacity(nodes, (n) => n.disk);
  const running = vms?.filter((vm) => vm.state === VMState.RUNNING).length ?? 0;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-stretch divide-x divide-border border border-border bg-card">
        <Stat label="Nodes">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1" aria-hidden>
              {nodes.map((n) => (
                <span
                  key={n.id ?? "master"}
                  className={cn(
                    "h-2 w-2",
                    n.status === "online" && "bg-success",
                    n.status === "offline" && "bg-destructive",
                    n.status === "maintenance" && "bg-warning",
                  )}
                />
              ))}
            </span>
            <span className="font-mono tabular-nums">
              {isLoading ? "…" : `${online} / ${nodes.length}`}
            </span>
            <span className="text-xs text-muted-foreground">online</span>
          </span>
        </Stat>
        <Stat label="vCPU in use" className="w-40">
          <CapacityBar label="" ariaLabel="vCPU" capacity={cpu} format={(n) => `${Math.round(n)}`} />
        </Stat>
        <Stat label="Memory in use" className="w-44">
          <CapacityBar label="" ariaLabel="Memory" capacity={mem} format={formatGb} />
        </Stat>
        <Stat label="Disk in use" className="w-44">
          <CapacityBar label="" ariaLabel="Disk" capacity={disk} format={formatGb} />
        </Stat>
        <Stat label="VMs">
          {vms ? (
            <span className="font-mono tabular-nums">
              {vms.length}
              <span className="text-xs text-muted-foreground">
                {" "}
                · {running} running
              </span>
            </span>
          ) : (
            <span className="font-mono text-muted-foreground/60">—</span>
          )}
        </Stat>
      </div>
      {showActions && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onGuide}>
            <BookOpen className="h-4 w-4" />
            Setup guide
          </Button>
          {onRegister && (
            <Button onClick={onRegister}>
              <Plus className="h-4 w-4" />
              Register a node
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between gap-1.5 px-4 py-2.5", className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="border-b border-border border-l-[3px] border-l-border px-5 py-4"
        >
          <div className="h-10 animate-pulse bg-secondary/40" />
        </li>
      ))}
    </>
  );
}

function EmptySlaves({
  onRegister,
  onGuide,
}: {
  onRegister?: () => void;
  onGuide: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4 border-l-[3px] border-l-border px-5 py-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <ServerOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-mono text-sm font-semibold">No slave nodes yet</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every VM runs on the master for now. Register another machine to
            spread VMs across hosts; the master schedules them where there is
            room.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={onGuide}>
          <BookOpen className="h-3.5 w-3.5" />
          Setup guide
        </Button>
        {onRegister && (
          <Button size="sm" onClick={onRegister}>
            <Plus className="h-3.5 w-3.5" />
            Register a node
          </Button>
        )}
      </div>
    </div>
  );
}
