import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SecretField, copyToClipboard } from "@/components/ui/secret-field";
import { VMState } from "@/lib/types/vm-state";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/hooks/useTimezone";
import { API_BASE_URL } from "@/lib/api/core";
import { adoptVM, getUnmanagedVMs } from "@/lib/api/slaves";
import { CapacityBar } from "./capacity-bar";
import { CodeBlock } from "./code-block";
import { formatGb, type ClusterNode, type NodeStatus } from "./node-model";

export const NODE_GRID =
  "grid grid-cols-[minmax(160px,1.2fr)_minmax(170px,1.5fr)_repeat(3,minmax(108px,0.9fr))_52px_24px] items-center gap-x-4";

const STATUS_LABEL: Record<NodeStatus, string> = {
  online: "online",
  offline: "offline",
  maintenance: "maintenance",
};

function StatusDot({ status }: { status: NodeStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 shrink-0",
        status === "online" && "bg-success shadow-[0_0_6px_var(--success)]",
        status === "offline" && "bg-destructive",
        status === "maintenance" && "bg-warning",
      )}
    />
  );
}

function RoleTag({ role }: { role: ClusterNode["role"] }) {
  return (
    <span
      className={cn(
        "border px-1 py-px font-mono text-[10px] leading-none",
        role === "master"
          ? "border-primary/50 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      {role}
    </span>
  );
}

function heartbeatLine(node: ClusterNode, now: number): string {
  if (node.role === "master") return "this server";
  if (!node.lastHeartbeat) return "no heartbeat yet";
  const rel = formatRelative(node.lastHeartbeat, now);
  return node.status === "online" ? `heartbeat ${rel}` : `last seen ${rel}`;
}

export function NodeRow({
  node,
  expanded,
  onToggle,
  canDelete,
  canAdopt,
  onDelete,
  timezone,
  now,
}: {
  node: ClusterNode;
  expanded: boolean;
  onToggle: () => void;
  canDelete: boolean;
  canAdopt: boolean;
  onDelete: () => void;
  timezone: string;
  now: number;
}) {
  const offline = node.status === "offline";
  const running = node.vms?.filter((vm) => vm.state === VMState.RUNNING).length;
  const panelId = `node-panel-${node.id ?? "master"}`;

  return (
    <li
      className={cn(
        "border-l-[3px] border-b border-b-border bg-card transition-colors",
        node.status === "online" && "border-l-success",
        node.status === "offline" && "border-l-destructive",
        node.status === "maintenance" && "border-l-warning",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          NODE_GRID,
          "cursor-pointer px-5 py-3.5 outline-none hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
          expanded && "bg-secondary/30",
        )}
      >
        {/* Name + status */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[15px] font-semibold tracking-tight">
              {node.name}
            </span>
            <RoleTag role={node.role} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot status={node.status} />
            <span
              className={cn(
                offline && "text-destructive",
                node.status === "maintenance" && "text-warning",
                node.status === "online" && "text-foreground/80",
              )}
            >
              {STATUS_LABEL[node.status]}
            </span>
            <span aria-hidden>·</span>
            <span
              className="truncate"
              title={
                node.lastHeartbeat
                  ? formatDateTime(node.lastHeartbeat, timezone, {
                      second: "2-digit",
                    })
                  : undefined
              }
            >
              {heartbeatLine(node, now)}
            </span>
          </div>
        </div>

        {/* Address (plain: a hostname is not a secret) */}
        <div className="group/addr flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-xs text-foreground/85">
            {node.address}
          </span>
          <button
            type="button"
            aria-label="Copy address"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(node.address, "Address copied");
            }}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/addr:opacity-100"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>

        <CapacityBar
          label=""
          ariaLabel="vCPU"
          capacity={node.cpu}
          format={(n) => `${Math.round(n)}`}
          dimmed={offline}
        />
        <CapacityBar
          label=""
          ariaLabel="Memory"
          capacity={node.mem}
          format={formatGb}
          dimmed={offline}
        />
        <CapacityBar
          label=""
          ariaLabel="Disk"
          capacity={node.disk}
          format={formatGb}
          dimmed={offline}
        />

        {/* VM count */}
        <div className="text-right">
          {node.vms ? (
            <>
              <div className="font-mono text-base tabular-nums leading-none">
                {node.vms.length}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {node.vms.length === 0 ? "no VMs" : `${running} running`}
              </div>
            </>
          ) : (
            <div className="font-mono text-muted-foreground/60">—</div>
          )}
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 justify-self-end text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </div>

      {expanded && (
        <div
          id={panelId}
          className="border-t border-border bg-background/40 px-5 py-5"
        >
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <NodeDetails node={node} timezone={timezone} now={now} />
            <NodeSidePanel node={node} canAdopt={canAdopt} />
          </div>
          {node.role === "slave" && canDelete && (
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Unregistering stops this slave&apos;s VMs and removes them from
                this master. Their disks stay on the machine.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Unregister {node.name}…
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 py-2 text-sm">
      <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 leading-5">{children}</dd>
    </div>
  );
}

function NodeDetails({
  node,
  timezone,
  now,
}: {
  node: ClusterNode;
  timezone: string;
  now: number;
}) {
  return (
    <dl className="divide-y divide-border/70">
      {node.role === "master" ? (
        <>
          <Row label="Role">
            The master: it runs this dashboard and schedules VMs on itself and
            on every slave below.
          </Row>
          <Row label="API">
            <span className="font-mono text-xs">{API_BASE_URL}</span>
            <p className="mt-1 text-xs text-muted-foreground">
              Slaves point <span className="font-mono">MASTER_URL</span> at this
              address.
            </p>
          </Row>
        </>
      ) : (
        <>
          <Row label="Address">
            <span className="font-mono text-xs">{node.address}</span>
          </Row>
          <Row label="Last heartbeat">
            {node.lastHeartbeat ? (
              <>
                <span className="font-mono text-xs">
                  {formatDateTime(node.lastHeartbeat, timezone, {
                    second: "2-digit",
                  })}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatRelative(node.lastHeartbeat, now)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">never</span>
            )}
          </Row>
          {node.registeredAt && (
            <Row label="Registered">
              <span className="font-mono text-xs">
                {formatDateTime(node.registeredAt, timezone)}
              </span>
            </Row>
          )}
          {node.id && (
            <Row label="Slave id">
              <span className="break-all font-mono text-xs text-muted-foreground">
                {node.id}
              </span>
            </Row>
          )}
          {node.apiKey && (
            <Row label="API key">
              <SecretField
                value={node.apiKey}
                label="API key"
                size="md"
                wrap
                toastMessage="API key copied"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Matches <span className="font-mono">SLAVE_API_KEY</span> in the
                slave&apos;s .env.
              </p>
            </Row>
          )}
          {node.cpu && !node.cpu.live && node.status === "online" && (
            <Row label="Capacity">
              <span className="text-xs text-muted-foreground">
                From the slave&apos;s last report; live host figures need the
                host:get policy.
              </span>
            </Row>
          )}
        </>
      )}
    </dl>
  );
}

function NodeSidePanel({
  node,
  canAdopt,
}: {
  node: ClusterNode;
  canAdopt: boolean;
}) {
  if (node.status === "offline" && node.role === "slave") {
    return <OfflineChecklist node={node} />;
  }
  if (node.status === "maintenance") {
    return (
      <div className="border border-warning/40 bg-warning/5 p-4 text-sm">
        <p className="font-medium text-warning">In maintenance</p>
        <p className="mt-1 text-muted-foreground">
          The slave is reachable but not accepting new VMs. It returns to online
          on its own once maintenance ends.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <NodeVmList node={node} />
      {canAdopt && node.role === "slave" && node.id && (
        <UnmanagedVmList slaveId={node.id} />
      )}
    </div>
  );
}

function UnmanagedVmList({ slaveId }: { slaveId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["slaves", slaveId, "unmanaged-vms"];
  const vmsQuery = useQuery({
    queryKey,
    queryFn: () => getUnmanagedVMs(slaveId),
    retry: false,
  });
  const adopt = useMutation({
    mutationFn: (vmId: string) => adoptVM(slaveId, vmId),
    onSuccess: (vm) => {
      toast.success(`${vm.name} adopted`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (vmsQuery.error) {
    return (
      <p className="text-xs text-destructive">
        Could not list this slave&apos;s other VMs: {vmsQuery.error.message}
      </p>
    );
  }
  if (!vmsQuery.data?.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Not managed by this master
      </p>
      <ul className="divide-y divide-border/70 border border-border">
        {vmsQuery.data.map((vm) => (
          <li
            key={vm.id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="truncate font-mono text-xs">{vm.name}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={adopt.isPending}
              onClick={() => adopt.mutate(vm.id)}
            >
              Adopt
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NodeVmList({ node }: { node: ClusterNode }) {
  if (!node.vms) {
    return (
      <div className="text-sm text-muted-foreground">
        VM placement needs the <span className="font-mono">vms:get</span>{" "}
        policy.
      </div>
    );
  }
  if (node.vms.length === 0) {
    return (
      <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
        No VMs on this host yet. Pick it as the target when you provision one.
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">VMs on this host</p>
      <ul className="divide-y divide-border/70 border border-border">
        {node.vms.map((vm) => (
          <li
            key={vm.id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="truncate font-mono text-xs">{vm.name}</span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {vm.vcpus} vCPU · {vm.mem} GB
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  vm.state === VMState.RUNNING && "text-success",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5",
                    vm.state === VMState.RUNNING
                      ? "bg-success"
                      : "bg-muted-foreground/50",
                  )}
                />
                {vm.state}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OfflineChecklist({ node }: { node: ClusterNode }) {
  const host = node.raw?.hostname ?? "<slave-host>";
  const port = node.raw?.port ?? 8081;
  const vmCount = node.vms?.length ?? 0;
  return (
    <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">
        No heartbeat from {node.name}
      </p>
      <p className="mt-1 text-muted-foreground">
        The slave sends one every 30 s. The master marks it offline after it
        misses them.
        {vmCount > 0 &&
          ` ${vmCount} VM${vmCount > 1 ? "s" : ""} on it cannot be reached until it reconnects.`}
      </p>
      <ol className="mt-3 space-y-3 text-xs">
        <li>
          <p className="text-foreground">1. On the slave, is Distribox up?</p>
          <CodeBlock
            className="mt-1.5"
            code="docker compose --profile slave ps"
            copyLabel="Command copied"
          />
        </li>
        <li>
          <p className="text-foreground">
            2. Can the slave reach this master?{" "}
            <span className="text-muted-foreground">
              Its <span className="font-mono">MASTER_URL</span> must be this
              address.
            </span>
          </p>
          <CodeBlock
            className="mt-1.5"
            code={`curl -sS ${API_BASE_URL}/health`}
            copyLabel="Command copied"
          />
        </li>
        <li>
          <p className="text-foreground">
            3. Can this master reach the slave on{" "}
            <span className="font-mono">
              {host}:{port}
            </span>
            ?
          </p>
          <CodeBlock
            className="mt-1.5"
            code={`curl -sS http://${host}:${port}/health`}
            copyLabel="Command copied"
          />
        </li>
        <li className="text-muted-foreground">
          4. Compare the API key shown on the left with{" "}
          <span className="font-mono">SLAVE_API_KEY</span> on the slave, then
          restart it:{" "}
          <span className="font-mono text-foreground">
            docker compose --profile slave up -d
          </span>
        </li>
      </ol>
    </div>
  );
}
