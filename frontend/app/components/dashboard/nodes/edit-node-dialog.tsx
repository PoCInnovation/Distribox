import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { Slave, UpdateSlavePayload } from "@/lib/types/slave";
import { type ClusterNode, validateSlaveHostname } from "./node-model";

export function EditNodeDialog({
  node,
  onOpenChange,
  onUpdate,
  isUpdating,
  existingNames,
}: {
  node: ClusterNode | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (slaveId: string, payload: UpdateSlavePayload) => Promise<Slave>;
  isUpdating: boolean;
  existingNames: string[];
}) {
  const slave = node?.raw ?? null;
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState("8081");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (slave) {
      setName(slave.name);
      setHostname(slave.hostname);
      setPort(String(slave.port));
      setTouched(false);
      setSubmitError(null);
    }
  }, [slave]);

  const trimmedName = name.trim();
  const trimmedHost = hostname.trim();
  const portNum = Number.parseInt(port, 10);

  const nameError = !trimmedName
    ? "Give the slave a name."
    : existingNames.includes(trimmedName)
      ? "A slave with this name already exists."
      : null;
  const hostError = validateSlaveHostname(trimmedHost);
  const portError =
    !Number.isInteger(portNum) || portNum < 1 || portNum > 65535
      ? "Port must be between 1 and 65535."
      : null;
  const valid = !nameError && !hostError && !portError;
  const unchanged =
    !!slave &&
    trimmedName === slave.name &&
    trimmedHost === slave.hostname &&
    portNum === slave.port;
  const portChanged =
    !!slave &&
    !portError &&
    Number.isInteger(portNum) &&
    portNum !== slave.port;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!slave || !valid || unchanged) return;
    setSubmitError(null);
    try {
      const payload: UpdateSlavePayload = {};
      if (trimmedName !== slave.name) payload.name = trimmedName;
      if (trimmedHost !== slave.hostname) payload.hostname = trimmedHost;
      if (portNum !== slave.port) payload.port = portNum;
      const updated = await onUpdate(slave.id, payload);
      toast.success(`${updated.name} updated`);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "The master could not update the slave.",
      );
    }
  };

  return (
    <Dialog open={!!slave} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle className="font-mono">Edit {slave?.name}</DialogTitle>
            <DialogDescription>
              Update where the master reaches this slave. Its ID, API key, and
              VM associations stay intact.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field
              id="edit-node-name"
              label="Name"
              hint="Shown in the slave list and in VM placement."
              error={touched ? nameError : null}
            >
              <Input
                id="edit-node-name"
                autoComplete="off"
                spellCheck={false}
                placeholder="gpu-slave-1"
                className="font-mono"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isUpdating}
                aria-invalid={touched && !!nameError}
              />
            </Field>

            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field
                id="edit-node-host"
                label="Hostname or IP"
                hint="As seen from the master."
                error={touched ? hostError : null}
              >
                <Input
                  id="edit-node-host"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="192.168.1.100"
                  className="font-mono"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  disabled={isUpdating}
                  aria-invalid={touched && !!hostError}
                />
              </Field>
              <Field
                id="edit-node-port"
                label="API port"
                hint="SLAVE_PORT"
                error={touched ? portError : null}
              >
                <Input
                  id="edit-node-port"
                  inputMode="numeric"
                  autoComplete="off"
                  className="font-mono"
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                  disabled={isUpdating}
                  aria-invalid={touched && !!portError}
                />
              </Field>
            </div>

            {portChanged && (
              <div className="border border-border bg-background/60 px-3 py-2.5 text-xs text-muted-foreground">
                Make sure{" "}
                <span className="font-mono text-foreground">
                  SLAVE_PORT={portNum}
                </span>{" "}
                matches what the slave listens on.
              </div>
            )}

            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isUpdating || unchanged || (touched && !valid)}
            >
              {isUpdating ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p
        className={
          error ? "text-xs text-destructive" : "text-xs text-muted-foreground"
        }
      >
        {error ?? hint}
      </p>
    </div>
  );
}
