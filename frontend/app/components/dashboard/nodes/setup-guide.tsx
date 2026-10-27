import { Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/lib/api/core";

export function slaveEnvSnippet({
  apiKey,
  port,
}: {
  apiKey: string;
  port: number | string;
}): string {
  return [
    "DISTRIBOX_MODE=slave",
    `MASTER_URL=${API_BASE_URL}`,
    `SLAVE_API_KEY=${apiKey}`,
    `SLAVE_PORT=${port}`,
  ].join("\n");
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: React.ReactNode;
}) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      className={
        tone === "warning"
          ? "ml-8 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
          : "ml-8 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground"
      }
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${tone === "warning" ? "text-warning" : "text-primary"}`}
      />
      <span>{children}</span>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="ml-8 overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  );
}

export function SlaveSetupGuide() {
  return (
    <ol className="space-y-6 text-sm">
      <li className="space-y-2">
        <StepTitle n={1}>Register the slave on this master</StepTitle>
        <p className="ml-8 text-muted-foreground">
          Click <strong>Register slave</strong> and enter a name, the hostname
          or IP of the remote machine, and its API port. An API key will be
          generated. Copy it, you will need it next.
        </p>
      </li>

      <li className="space-y-2">
        <StepTitle n={2}>Configure the slave machine</StepTitle>
        <p className="ml-8 text-muted-foreground">
          On the remote machine, clone Distribox and set the following
          environment variables in your <code>.env</code> file:
        </p>
        <Code>
          {`DISTRIBOX_MODE=slave
MASTER_URL=http://<master-ip>:8080
SLAVE_API_KEY=<key-from-step-1>
SLAVE_PORT=8081`}
        </Code>
        <Callout tone="warning">
          The <code>MASTER_URL</code> needs to be reachable by the slave and
          point to the Distribox backend.
        </Callout>
      </li>

      <li className="space-y-2">
        <StepTitle n={3}>Run the setup script</StepTitle>
        <p className="ml-8 text-muted-foreground">
          At the root of the Distribox repository, run the setup. This will
          install the necessary dependencies, create the necessary user groups,
          add them to your user and create the necessary files on your host.
        </p>
        <Callout tone="warning">
          Make sure that you are not running this as root, but rather the user
          that is going to run Distribox.
        </Callout>
        <Code>./setup.sh</Code>
        <Callout tone="info">
          The setup script will ask for your password if necessary.
        </Callout>
        <p className="ml-8 text-muted-foreground">
          If your system is not supported, we are probably working on it, but
          please open an issue on{" "}
          <a
            href="https://github.com/PoCInnovation/Distribox/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            GitHub
          </a>{" "}
          so we can help you.
        </p>
      </li>

      <li className="space-y-2">
        <StepTitle n={4}>Apply user group changes</StepTitle>
        <p className="ml-8 text-muted-foreground">
          If you are using a macOS system,{" "}
          <span className="font-bold text-foreground">
            close your current terminal session
          </span>{" "}
          and open a new one, this will be enough to apply the new user groups.
        </p>
        <p className="ml-8 text-muted-foreground">
          If you are using Linux, you will need to{" "}
          <span className="font-bold text-foreground">
            log out and log back in
          </span>{" "}
          to apply the changes.
        </p>
        <p className="ml-8 text-muted-foreground">
          Alternatively, you can run the following command to apply the changes{" "}
          <span className="font-bold">in your current session only.</span>
        </p>
        <Code>newgrp distribox libvirt</Code>
      </li>

      <li className="space-y-2">
        <StepTitle n={5}>Start the slave</StepTitle>
        <p className="ml-8 text-muted-foreground">
          Start Distribox in slave mode using Docker Compose:
        </p>
        <Code>docker compose --profile slave up -d</Code>
        <p className="ml-8 text-muted-foreground">
          The slave will send a heartbeat every 30 seconds. Once received, the
          slave will appear here as{" "}
          <Badge variant="default" className="bg-chart-3">
            online
          </Badge>{" "}
          and you can start creating VMs on it. Good to go!
        </p>
      </li>

      <li className="space-y-2">
        <StepTitle n={6}>Stopping the slave</StepTitle>
        <p className="ml-8 text-muted-foreground">
          We recommend that you always stop the slave gracefully with the
          following command in order to avoid ghost VMs.
        </p>
        <Code>docker compose --profile slave down</Code>
      </li>
    </ol>
  );
}
