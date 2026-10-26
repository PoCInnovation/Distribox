import { useEffect, useState } from "react";
import { Check } from "lucide-react";
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
import { SecretField } from "@/components/ui/secret-field";
import { API_BASE_URL } from "@/lib/api/core";
import type { CreateSlavePayload, Slave } from "@/lib/types/slave";
import { CodeBlock } from "./code-block";
import { slaveEnvSnippet } from "./setup-guide";

const HOSTNAME_RE = /^[a-zA-Z0-9.\-_:[\]]+$/;

export function RegisterNodeDialog({
  open,
  onOpenChange,
  onRegister,
  isRegistering,
  existingNames,
  onOpenGuide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegister: (payload: CreateSlavePayload) => Promise<Slave>;
  isRegistering: boolean;
  existingNames: string[];
  onOpenGuide: () => void;
}) {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState("8081");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Slave | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset after the close animation so the success step doesn't flash the form.
      const t = window.setTimeout(() => {
        setName("");
        setHostname("");
        setPort("8081");
        setTouched(false);
        setSubmitError(null);
        setCreated(null);
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const trimmedName = name.trim();
  const trimmedHost = hostname.trim();
  const portNum = Number.parseInt(port, 10);

  const nameError = !trimmedName
    ? "Give the node a name."
    : existingNames.includes(trimmedName)
      ? "A node with this name already exists."
      : null;
  const hostError = !trimmedHost
    ? "Hostname or IP the master can reach."
    : !HOSTNAME_RE.test(trimmedHost)
      ? "Hostname only: no scheme, no path."
      : null;
  const portError =
    !Number.isInteger(portNum) || portNum < 1 || portNum > 65535
      ? "Port must be between 1 and 65535."
      : null;
  const valid = !nameError && !hostError && !portError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setSubmitError(null);
    try {
      const slave = await onRegister({
        name: trimmedName,
        hostname: trimmedHost,
        port: portNum,
      });
      setCreated(slave);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "The master refused the node.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {created ? (
          <RegisteredStep
            slave={created}
            onDone={() => onOpenChange(false)}
            onOpenGuide={() => {
              onOpenChange(false);
              onOpenGuide();
            }}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle className="font-mono">Register a node</DialogTitle>
              <DialogDescription>
                Tell the master where the slave will listen. You configure the
                slave machine itself in the next step, with the key this
                generates.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-4">
              <Field
                id="node-name"
                label="Name"
                hint="Shown in the node list and in VM placement."
                error={touched ? nameError : null}
              >
                <Input
                  id="node-name"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="gpu-node-1"
                  className="font-mono"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={touched && !!nameError}
                />
              </Field>

              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                <Field
                  id="node-host"
                  label="Hostname or IP"
                  hint="As seen from the master."
                  error={touched ? hostError : null}
                >
                  <Input
                    id="node-host"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="192.168.1.100"
                    className="font-mono"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    aria-invalid={touched && !!hostError}
                  />
                </Field>
                <Field
                  id="node-port"
                  label="API port"
                  hint="SLAVE_PORT"
                  error={touched ? portError : null}
                >
                  <Input
                    id="node-port"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-mono"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                    aria-invalid={touched && !!portError}
                  />
                </Field>
              </div>

              <div className="border border-border bg-background/60 px-3 py-2.5 text-xs text-muted-foreground">
                The slave will call back to{" "}
                <span className="font-mono text-foreground">{API_BASE_URL}</span>.
                If that address is not reachable from the slave, set{" "}
                <span className="font-mono">MASTER_URL</span> to one that is.
              </div>

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
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRegistering || (touched && !valid)}>
                {isRegistering ? "Registering…" : "Register and get key"}
              </Button>
            </DialogFooter>
          </form>
        )}
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

function RegisteredStep({
  slave,
  onDone,
  onOpenGuide,
}: {
  slave: Slave;
  onDone: () => void;
  onOpenGuide: () => void;
}) {
  const env = slaveEnvSnippet({ apiKey: slave.api_key, port: slave.port });
  return (
    <div>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-mono">
          <span className="flex h-6 w-6 items-center justify-center bg-success text-background">
            <Check className="h-4 w-4" />
          </span>
          {slave.name} registered
        </DialogTitle>
        <DialogDescription>
          It shows as offline until its first heartbeat. Finish on the slave
          machine:
        </DialogDescription>
      </DialogHeader>

      <div className="mt-5 space-y-5">
        <section>
          <p className="mb-1.5 text-xs text-muted-foreground">
            API key. Also shown in the node details later.
          </p>
          <SecretField
            value={slave.api_key}
            label="API key"
            size="md"
            defaultVisible
            wrap
            toastMessage="API key copied"
          />
        </section>

        <section>
          <p className="mb-1.5 text-xs text-muted-foreground">
            1. In the Distribox checkout on{" "}
            <span className="font-mono text-foreground">{slave.hostname}</span>,
            add to .env:
          </p>
          <CodeBlock code={env} title=".env" copyLabel=".env lines copied" />
        </section>

        <section>
          <p className="mb-1.5 text-xs text-muted-foreground">
            2. First time on this machine: install host dependencies, then pick
            up the new groups.
          </p>
          <CodeBlock
            code={"./setup.sh\nnewgrp distribox libvirt"}
            copyLabel="Commands copied"
          />
        </section>

        <section>
          <p className="mb-1.5 text-xs text-muted-foreground">3. Start it:</p>
          <CodeBlock
            code="docker compose --profile slave up -d"
            copyLabel="Command copied"
          />
        </section>
      </div>

      <DialogFooter className="mt-6 sm:justify-between">
        <Button type="button" variant="ghost" onClick={onOpenGuide}>
          Full setup guide
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
