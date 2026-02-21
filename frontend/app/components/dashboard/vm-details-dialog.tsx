import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  KeyRound,
  Server,
  Terminal,
  Trash2,
  InfoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  createVMCredential,
  getVMCredentials,
  isForbiddenError,
  rememberForbiddenError,
  revokeVMCredential,
} from "@/lib/api";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";

interface VMDetailsDialogProps {
  vm: VirtualMachineMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onConfigureVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
}

function badgeColor(state: VMState): string {
  switch (state) {
    case VMState.RUNNING:
      return "border-chart-3 bg-chart-3/10 text-chart-3";
    case VMState.PAUSED:
    case VMState.STOPPED:
      return "border-muted bg-muted/10 text-muted-foreground";
    case VMState.CRASHED:
    case VMState.BLOCKED:
      return "border-destructive bg-destructive/10 text-destructive";
    case VMState.SHUTDOWN:
      return "border-yellow-400 bg-yellow-400/10 text-yellow-400";
    case VMState.PMSUSPENDED:
      return "border-accent bg-accent/10 text-accent";
    case VMState.NOSTATE:
      return "border-muted bg-muted/10 text-muted-foreground";
  }
}

export function VMDetailsDialog({
  vm,
  open,
  onOpenChange,
  onConnectVM,
}: VMDetailsDialogProps) {
  const queryClient = useQueryClient();
  const [credentialName, setCredentialName] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");

  const credentialsQuery = useQuery({
    queryKey: ["vm-credentials", vm?.id],
    queryFn: () => getVMCredentials(vm?.id ?? ""),
    enabled: open && !!vm,
    retry: false,
  });

  const createCredentialMutation = useMutation({
    mutationFn: async () => {
      if (!vm) {
        throw new Error("No VM selected");
      }

      return createVMCredential(vm.id, {
        name: credentialName.trim(),
        password: credentialPassword.trim() || undefined,
      });
    },
    onSuccess: () => {
      if (!vm) {
        return;
      }

      setCredentialName("");
      setCredentialPassword("");
      queryClient.invalidateQueries({ queryKey: ["vm-credentials", vm.id] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      toast.success("Credential created");
    },
    onError: (error) => {
      if (!vm) {
        return;
      }

      if (isForbiddenError(error)) {
        const endpoint = `/vms/${vm.id}/credentials/create`;
        rememberForbiddenError(endpoint, error);
        toast.error(error.message);
        return;
      }

      toast.error(
        error instanceof Error ? error.message : "Failed to create credential",
      );
    },
  });

  const revokeCredentialMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      if (!vm) {
        throw new Error("No VM selected");
      }

      await revokeVMCredential(vm.id, credentialId);
      return credentialId;
    },
    onSuccess: () => {
      if (!vm) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["vm-credentials", vm.id] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      toast.success("Credential revoked");
    },
    onError: (error, credentialId) => {
      if (!vm) {
        return;
      }

      if (isForbiddenError(error)) {
        const endpoint = `/vms/${vm.id}/credentials/revoke/${credentialId}`;
        rememberForbiddenError(endpoint, error);
        toast.error(error.message);
        return;
      }

      toast.error(
        error instanceof Error ? error.message : "Failed to revoke credential",
      );
    },
  });

  const credentials = credentialsQuery.data ?? [];
  const hasCredentialName = useMemo(
    () => credentialName.trim().length > 0,
    [credentialName],
  );

  if (!vm) {
    return null;
  }

  const handleCreateCredential = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasCredentialName || createCredentialMutation.isPending) {
      return;
    }

    createCredentialMutation.mutate();
  };

  const handleCopyPassword = async (password: string) => {
    await navigator.clipboard.writeText(password);
    toast.success("Credential copied to clipboard");
  };

  const headerDescription = vm.ipv4
    ? `IP ${vm.ipv4}`
    : "No IP address available";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl lg:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center border border-border bg-secondary">
              <Server className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="font-mono">{vm.name}</DialogTitle>
              <DialogDescription>{headerDescription}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between border border-border bg-secondary px-4 py-2">
            <span className="text-sm text-muted-foreground">
              Compute Resources
            </span>
            <span className="font-mono text-sm">
              {vm.vcpus} vCPU • {vm.mem} GB RAM • {vm.disk_size} GB Disk
            </span>
          </div>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="default" className={badgeColor(vm.state)}>
                {vm.state}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Operating System
              </span>
              <span className="font-mono text-sm">{vm.os}</span>
            </div>
          </div>

          <div className="space-y-3 border border-border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Credentials
              </h4>
              <span className="text-xs text-muted-foreground">
                {credentials.length} total
              </span>
            </div>

            <form
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2"
              onSubmit={handleCreateCredential}
            >
              <Input
                value={credentialName}
                onChange={(e) => setCredentialName(e.target.value)}
                placeholder="Credential name"
                disabled={createCredentialMutation.isPending}
              />
              <Input
                type="password"
                value={credentialPassword}
                onChange={(e) => setCredentialPassword(e.target.value)}
                placeholder="Credential password (optional)"
                disabled={createCredentialMutation.isPending}
              />
              <Button
                type="submit"
                disabled={
                  !hasCredentialName || createCredentialMutation.isPending
                }
              >
                {createCredentialMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
            <p className="flex flex-row space-x-1 text-xs text-muted-foreground">
              <InfoIcon className="h-4 w-4 text-accent" />
              <span className="text-accent">
                Leave password empty to auto-generate a UUID password.
              </span>
            </p>

            {credentialsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading credentials...
              </p>
            ) : credentialsQuery.isError ? (
              <p className="text-sm text-destructive">
                {isForbiddenError(credentialsQuery.error)
                  ? credentialsQuery.error.message
                  : "Failed to load credentials"}
              </p>
            ) : credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No credentials for this VM.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {credentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="flex items-center justify-between rounded-md border border-border bg-secondary px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-md font-medium truncate">
                        {credential.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Created{" "}
                        {new Date(credential.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => handleCopyPassword(credential.password)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={revokeCredentialMutation.isPending}
                        onClick={() =>
                          revokeCredentialMutation.mutate(credential.id)
                        }
                      >
                        <span>
                        Revoke
                        </span>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={(e) => onConnectVM?.(vm, e)}>
            <Terminal className="mr-2 h-4 w-4" />
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
