import { useState } from "react";
import {
  Server,
  Plus,
  Trash2,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SecretField } from "@/components/ui/secret-field";
import { useSlaves } from "@/hooks/useSlaves";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { PolicyGate } from "@/components/policy/policy-gate";
import type { Slave } from "@/lib/types/slave";
import { toast } from "sonner";

function SlaveStatusBadge({ status }: { status: string }) {
  const variant =
    status === "online"
      ? "default"
      : status === "maintenance"
        ? "secondary"
        : "destructive";
  const className = status === "online" ? "bg-chart-3" : undefined

  return <Badge variant={variant} className={className}>{status}</Badge>;
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ResourceBar({
  icon: Icon,
  label,
  total,
  availablePercent,
  unit,
  online,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  total: number;
  availablePercent: number;
  unit: string;
  online: boolean;
  iconColor: string;
}) {
  const usedPercent = 100 - availablePercent;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className={`flex items-center gap-1.5 ${iconColor}`}>
          <Icon className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            {label}{" "}
            <span className="font-normal text-muted-foreground">
              ({total} {unit})
            </span>
          </span>
        </div>
        {online && (
          <span className="font-mono text-muted-foreground">
            {usedPercent.toFixed(0)}%
          </span>
        )}
      </div>
      {online && <Progress value={usedPercent} className="h-1.5" />}
    </div>
  );
}

function SlaveCard({
  slave,
  onDelete,
  canDelete,
}: {
  slave: Slave;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const isOnline = slave.status === "online";

  return (
    <Card className="relative border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{slave.name}</CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SlaveStatusBadge status={slave.status} />
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Address */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Address
          </span>
          <SecretField
            value={`${slave.hostname}:${slave.port}`}
            placeholder="•••.•••.•••.•••:••••"
            toastMessage="Address copied to clipboard"
          />
        </div>

        {/* Resources */}
        <div className="space-y-3">
          <ResourceBar
            icon={Cpu}
            label="CPU"
            total={slave.total_cpu}
            availablePercent={slave.available_cpu}
            unit="vCPUs"
            online={isOnline}
            iconColor="text-primary"
          />
          <ResourceBar
            icon={MemoryStick}
            label="Memory"
            total={slave.total_mem}
            availablePercent={slave.available_mem}
            unit="GB"
            online={isOnline}
            iconColor="text-chart-2"
          />
          <ResourceBar
            icon={HardDrive}
            label="Disk"
            total={slave.total_disk}
            availablePercent={slave.available_disk}
            unit="GB"
            online={isOnline}
            iconColor="text-chart-4"
          />
        </div>

        {/* API Key */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            API Key
          </span>
          <SecretField
            value={slave.api_key}
            toastMessage="API key copied to clipboard"
          />
        </div>

        {/* Timestamps */}
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span title={new Date(slave.created_at).toLocaleString()}>
              Registered {formatRelativeTime(slave.created_at)}
            </span>
          </div>
          {slave.last_heartbeat && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span title={new Date(slave.last_heartbeat).toLocaleString()}>
                Last heartbeat {formatRelativeTime(slave.last_heartbeat)}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SlavesPage() {
  const {
    slaves,
    isLoading,
    createSlave,
    isCreating,
    deleteSlave,
    isDeleting,
  } = useSlaves();
  const authz = useAuthz();
  const canCreate = authz.hasPolicy(Policy.SLAVES_CREATE);
  const canDelete = authz.hasPolicy(Policy.SLAVES_DELETE);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Slave | null>(null);
  const [form, setForm] = useState({ name: "", hostname: "", port: "8081" });

  const handleCreate = async () => {
    try {
      const result = await createSlave({
        name: form.name,
        hostname: form.hostname,
        port: parseInt(form.port, 10),
      });
      toast.success(`Slave "${result.name}" registered. API key has been generated.`);
      setCreateOpen(false);
      setForm({ name: "", hostname: "", port: "8081" });
    } catch {
      toast.error("Failed to register slave");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSlave(deleteTarget.id);
      toast.success(`Slave "${deleteTarget.name}" unregistered`);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to unregister slave");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Loading slaves...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PolicyGate requiredPolicies={[Policy.SLAVES_CREATE]}>
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)} disabled={!canCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Register Slave
          </Button>
        </div>
      </PolicyGate>

      {slaves.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-2 text-lg font-medium">No slaves registered</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Register a slave node to start distributing VMs across machines.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {slaves.map((slave) => (
            <SlaveCard
              key={slave.id}
              slave={slave}
              onDelete={() => setDeleteTarget(slave)}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Slave Node</DialogTitle>
            <DialogDescription>
              Add a new slave node to your Distribox cluster. The slave must be
              running Distribox in slave mode and reachable at the given address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="slave-name">Name</Label>
              <Input
                id="slave-name"
                placeholder="e.g. gpu-node-1"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slave-hostname">Hostname / IP</Label>
              <Input
                id="slave-hostname"
                placeholder="e.g. 192.168.1.100"
                value={form.hostname}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hostname: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slave-port">Port</Label>
              <Input
                id="slave-port"
                type="number"
                placeholder="8081"
                value={form.port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, port: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || !form.hostname || isCreating}
            >
              {isCreating ? "Registering..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unregister Slave</DialogTitle>
            <DialogDescription>
              Are you sure you want to unregister{" "}
              <strong>{deleteTarget?.name}</strong>? VMs running on this slave
              will become unreachable from the master.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Unregistering..." : "Unregister"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
