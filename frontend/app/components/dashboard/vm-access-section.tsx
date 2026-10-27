import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaskedInput } from "@/components/ui/masked-input";
import { SecretField } from "@/components/ui/secret-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createVMCredential,
  getVMCredentials,
  isForbiddenError,
  rememberForbiddenError,
  revokeVMCredential,
} from "@/lib/api";
import { getVMSshSettings, updateVMSshSettings } from "@/lib/api/ssh";
import {
  Policy,
  type VirtualMachineMetadata,
  type VMCredential,
} from "@/lib/types";
import { useAuthz } from "@/contexts/authz-context";
import { formatDateTime, useTimezone } from "@/hooks/useTimezone";
import { formatMissingPolicies } from "@/hooks/useVmActions";
import { SshAccessSwitch } from "@/components/ssh-access-switch";
import { SshConnectionButton } from "@/components/ssh-connection-button";
import { cn } from "@/lib/utils";

/**
 * Access tab of the VM drawer: SSH toggle, credential list, credential
 * creation. Secrets are never rendered as password inputs.
 */
export function VmAccessSection({
  vm,
  active,
}: {
  vm: VirtualMachineMetadata;
  active: boolean;
}) {
  const authz = useAuthz();
  const queryClient = useQueryClient();
  const timeZone = useTimezone();

  const canManageSsh = authz.hasPolicy(Policy.VMS_SSH_MANAGE);
  const missingList = authz.missingPolicies([Policy.VMS_CREDENTIALS_LIST]);
  const missingCreate = authz.missingPolicies([Policy.VMS_CREDENTIALS_CREATE]);
  const missingRevoke = authz.missingPolicies([Policy.VMS_CREDENTIALS_REVOKE]);

  const sshQuery = useQuery({
    queryKey: ["vm-ssh", vm.id],
    queryFn: () => getVMSshSettings(vm.id),
    enabled: active && canManageSsh,
    retry: false,
  });

  const sshMutation = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean }) =>
      updateVMSshSettings(vm.id, enabled),
    onSuccess: (settings) => {
      queryClient.setQueryData(["vm-ssh", vm.id], settings);
      if (settings.enabled && settings.preparation_status === "pending") {
        toast.info("SSH allowed. Start the VM, then connect to finish setup.");
      } else {
        toast.success(settings.enabled ? "SSH allowed" : "SSH disabled");
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: (_s, error) => {
      if (error) queryClient.invalidateQueries({ queryKey: ["vm-ssh", vm.id] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      queryClient.invalidateQueries({ queryKey: ["ssh-connection"] });
    },
  });

  const credentialsQuery = useQuery({
    queryKey: ["vm-credentials", vm.id],
    queryFn: () => getVMCredentials(vm.id),
    enabled: active && missingList.length === 0,
    retry: false,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createVMCredential(vm.id, {
        name: name.trim(),
        password: secret.trim() || undefined,
      }),
    onSuccess: () => {
      setName("");
      setSecret("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["vm-credentials", vm.id] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      toast.success("Credential created");
    },
    onError: (error) => {
      if (isForbiddenError(error)) {
        rememberForbiddenError(`/vms/${vm.id}/credentials/create`, error);
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the credential",
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (credentialId: string) =>
      revokeVMCredential(vm.id, credentialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vm-credentials", vm.id] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      toast.success("Credential revoked");
    },
    onError: (error, credentialId) => {
      if (isForbiddenError(error)) {
        rememberForbiddenError(
          `/vms/${vm.id}/credentials/revoke/${credentialId}`,
          error,
        );
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not revoke the credential",
      );
    },
  });

  const sshEnabled = sshQuery.data?.enabled ?? vm.ssh_enabled;
  const credentials = credentialsQuery.data ?? [];
  const canSubmit = name.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="space-y-6">
      {/* SSH */}
      <div className="space-y-2">
        {canManageSsh ? (
          <>
            <SshAccessSwitch
              enabled={sshEnabled}
              onChange={(enabled) => sshMutation.mutate({ enabled })}
              disabled={!sshQuery.data || sshMutation.isPending}
              description="Lets anyone holding one of this machine's credentials open a terminal through the SSH gateway."
            />
            {sshQuery.isError && (
              <p className="text-sm text-destructive">
                {sshQuery.error.message}
              </p>
            )}
            {sshQuery.data && !sshQuery.data.available && (
              <p className="text-xs text-warning">
                The SSH gateway is unavailable. Check the deployment settings.
              </p>
            )}
            {sshQuery.data?.enabled &&
              sshQuery.data.preparation_status === "pending" && (
                <p className="text-xs text-muted-foreground">
                  SSH finishes setting up the next time the VM boots.
                </p>
              )}
          </>
        ) : (
          <div className="flex items-center justify-between border border-border px-4 py-3 text-sm">
            <span>SSH access</span>
            <span
              className={cn(
                sshEnabled ? "text-success" : "text-muted-foreground",
              )}
            >
              {sshEnabled ? "Allowed" : "Not allowed"}
            </span>
          </div>
        )}
      </div>

      {/* Credentials */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-muted-foreground" />
            Credentials
            <span className="font-mono text-xs text-muted-foreground">
              {credentialsQuery.data
                ? credentials.length
                : vm.credentials_count}
            </span>
          </h3>
          {!showForm && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-disabled={missingCreate.length > 0}
                  onClick={() =>
                    missingCreate.length === 0 && setShowForm(true)
                  }
                  className={cn(
                    "h-8",
                    missingCreate.length > 0 && "cursor-not-allowed opacity-45",
                  )}
                >
                  <Plus className="size-4" />
                  Add credential
                </Button>
              </TooltipTrigger>
              {missingCreate.length > 0 && (
                <TooltipContent side="left">
                  {formatMissingPolicies(missingCreate)}
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </div>

        {showForm && (
          <form
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) createMutation.mutate();
            }}
            className="space-y-3 border border-primary/30 bg-primary/[0.04] p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">New credential</p>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setName("");
                  setSecret("");
                }}
                aria-label="Cancel"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`cred-label-${vm.id}`}
                className="text-xs text-muted-foreground"
              >
                Label
              </Label>
              <Input
                id={`cred-label-${vm.id}`}
                name="credential-label"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. grader, alice, ci-bot"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={createMutation.isPending}
                className="h-9 bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`cred-secret-${vm.id}`}
                className="text-xs text-muted-foreground"
              >
                Access secret
              </Label>
              <MaskedInput
                id={`cred-secret-${vm.id}`}
                name="access-secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Leave empty to generate one"
                disabled={createMutation.isPending}
                className="h-9 bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Shared with whoever needs this machine. Used as the SSH password
                and shown in the list below.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!canSubmit}>
                {createMutation.isPending && (
                  <Loader2 className="animate-spin" />
                )}
                Create credential
              </Button>
            </div>
          </form>
        )}

        {missingList.length > 0 ? (
          <p className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {formatMissingPolicies(missingList)} to list credentials.
          </p>
        ) : credentialsQuery.isLoading ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading credentials…
          </p>
        ) : credentialsQuery.isError ? (
          <p className="text-sm text-destructive">
            {isForbiddenError(credentialsQuery.error)
              ? credentialsQuery.error.message
              : "Could not load credentials."}
          </p>
        ) : credentials.length === 0 ? (
          <p className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No credentials yet. Add one to hand out SSH or console access.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {credentials.map((credential) => (
              <CredentialRow
                key={credential.id}
                credential={credential}
                sshEnabled={sshEnabled}
                createdLabel={formatDateTime(credential.created_at, timeZone)}
                canRevoke={missingRevoke.length === 0}
                revokeReason={
                  missingRevoke.length > 0
                    ? formatMissingPolicies(missingRevoke)
                    : undefined
                }
                revoking={
                  revokeMutation.isPending &&
                  revokeMutation.variables === credential.id
                }
                onRevoke={() => revokeMutation.mutate(credential.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CredentialRow({
  credential,
  sshEnabled,
  createdLabel,
  canRevoke,
  revokeReason,
  revoking,
  onRevoke,
}: {
  credential: VMCredential;
  sshEnabled: boolean;
  createdLabel: string;
  canRevoke: boolean;
  revokeReason?: string;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium">
            {credential.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Created {createdLabel}
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Revoke access?
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-7"
              disabled={revoking}
              onClick={() => {
                onRevoke();
                setConfirming(false);
              }}
            >
              {revoking ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Revoke
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <SshConnectionButton
              credential={credential.password}
              sshEnabled={sshEnabled}
              className="h-7 px-2 text-xs"
            />
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Revoke credential"
                  aria-disabled={!canRevoke}
                  onClick={() => canRevoke && setConfirming(true)}
                  className={cn(
                    "size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                    !canRevoke && "cursor-not-allowed opacity-45",
                  )}
                >
                  {revoking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {revokeReason ?? "Revoke"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      <SecretField
        value={credential.password}
        toastMessage="Access secret copied"
        className="border border-border bg-background py-1 pr-1"
      />
    </li>
  );
}
