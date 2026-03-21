import { useState } from "react";
import {
  Server,
  Plus,
  Trash2,
  Cpu,
  MemoryStick,
  HardDrive,
  Copy,
  Check,
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
  return <Badge variant={variant}>{status}</Badge>;
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
  const [copied, setCopied] = useState(false);

  const copyApiKey = async () => {
    await navigator.clipboard.writeText(slave.api_key);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="group relative border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{slave.name}</CardTitle>
              <CardDescription>
                {slave.hostname}:{slave.port}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SlaveStatusBadge status={slave.status} />
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4" />
            <span>
              {slave.total_cpu} vCPUs
              {slave.status === "online" && (
                <span className="ml-1 text-xs text-green-500">
                  ({slave.available_cpu.toFixed(0)}% free)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MemoryStick className="h-4 w-4" />
            <span>
              {slave.total_mem} GB
              {slave.status === "online" && (
                <span className="ml-1 text-xs text-green-500">
                  ({slave.available_mem.toFixed(1)} GB free)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            <span>
              {slave.total_disk} GB
              {slave.status === "online" && (
                <span className="ml-1 text-xs text-green-500">
                  ({slave.available_disk.toFixed(1)} GB free)
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
            {slave.api_key}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={copyApiKey}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {slave.last_heartbeat && (
          <p className="text-xs text-muted-foreground">
            Last heartbeat:{" "}
            {new Date(slave.last_heartbeat).toLocaleString()}
          </p>
        )}
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
  const [form, setForm] = useState({ name: "", hostname: "", port: "8080" });

  const handleCreate = async () => {
    try {
      const result = await createSlave({
        name: form.name,
        hostname: form.hostname,
        port: parseInt(form.port, 10),
      });
      toast.success(`Slave "${result.name}" registered. API key has been generated.`);
      setCreateOpen(false);
      setForm({ name: "", hostname: "", port: "8080" });
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
                placeholder="8080"
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
