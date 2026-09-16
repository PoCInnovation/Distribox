import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SecretField } from "@/components/ui/secret-field";
import { getSshConnection } from "@/lib/api/ssh";

export function SshConnectionButton({
  credential,
  className,
  onOpenChange,
}: {
  credential: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const connection = useQuery({
    queryKey: ["ssh-connection", id],
    queryFn: ({ signal }) => getSshConnection(credential, signal),
    retry: false,
    gcTime: 0,
    refetchInterval: open ? 30000 : false,
    refetchOnWindowFocus: true,
  });

  const settings = connection.data;
  if (!settings?.enabled && !open) return null;

  const command = settings?.host
    ? `ssh -p ${settings.port} ${settings.credential_id}@${settings.host}`
    : "";
  const ready =
    !connection.isError && settings?.enabled && settings.available && command;

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
    if (value) void connection.refetch();
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("SSH command copied");
    } catch {
      toast.error("Could not copy. Select and copy the command below.");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => handleOpenChange(true)}
      >
        <Terminal className="h-4 w-4" />
        SSH
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect with SSH</DialogTitle>
            <DialogDescription>{settings?.vm_name}</DialogDescription>
          </DialogHeader>
          {connection.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {connection.error.message}
            </p>
          ) : !settings?.enabled ? (
            <p className="text-sm text-muted-foreground">
              The host has disabled SSH for this VM.
            </p>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">
              The SSH gateway is unavailable. Contact the host or use the web
              client.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm">Run this command in your terminal.</p>
                <div className="rounded-md border border-border bg-secondary p-3">
                  <code className="block select-all break-all text-sm">
                    {command}
                  </code>
                </div>
                <Button type="button" variant="secondary" onClick={copyCommand}>
                  <Copy className="h-4 w-4" />
                  Copy command
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-sm">
                  When asked for a password, paste your access secret.
                </p>
                <SecretField
                  value={credential}
                  wrap
                  toastMessage="Access secret copied"
                  className="rounded-md border border-border bg-secondary p-2"
                />
              </div>
              {settings.host_key_fingerprint && (
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-sm font-medium">
                    Verify your first connection
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Compare the fingerprint in your terminal with this one
                    before accepting the host key.
                  </p>
                  <code className="block select-all break-all text-xs">
                    {settings.host_key_fingerprint}
                  </code>
                </div>
              )}
              {settings.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Access expires{" "}
                  {new Date(settings.expires_at).toLocaleString()}.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
