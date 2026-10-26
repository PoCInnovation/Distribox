import { API_BASE_URL } from "@/lib/api/core";
import { CodeBlock } from "./code-block";
import { cn } from "@/lib/utils";

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

function Step({
  n,
  title,
  children,
  className,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3", className)}>
      <span className="mt-0.5 h-6 w-6 border border-primary/60 text-center font-mono text-xs leading-6 text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-6">{title}</p>
        <div className="mt-1.5 space-y-2 text-sm text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "border-l-2 py-1 pl-3 text-xs",
        tone === "warn"
          ? "border-warning text-warning"
          : "border-primary/60 text-foreground/80",
      )}
    >
      {children}
    </p>
  );
}

/**
 * The full "turn a machine into a slave" walkthrough. The numbering is real:
 * each step depends on the previous one.
 */
export function SlaveSetupGuide({
  apiKey,
  port = 8081,
  startAt = 1,
}: {
  /** When known (right after registering) the snippets are filled in. */
  apiKey?: string;
  port?: number | string;
  /** Skip the "register" step when the guide is shown after registering. */
  startAt?: 1 | 2;
}) {
  const env = slaveEnvSnippet({
    apiKey: apiKey ?? "<key shown after registering>",
    port,
  });
  const n = (i: number) => i - (startAt - 1);

  return (
    <ol className="space-y-6">
      {startAt === 1 && (
        <Step n={1} title="Register the node on this master">
          <p>
            Use <strong className="text-foreground">Register a node</strong>{" "}
            and give it a name, the hostname or IP the master can reach it on,
            and its API port. You get an API key at the end. Copy it, you need
            it in the next step.
          </p>
        </Step>
      )}

      <Step n={n(2)} title="Configure the slave machine">
        <p>
          On the remote machine, clone Distribox and put these lines in its{" "}
          <span className="font-mono text-foreground">.env</span>:
        </p>
        <CodeBlock code={env} title=".env on the slave" copyLabel=".env lines copied" />
        <Note tone="warn">
          MASTER_URL must be reachable from the slave and point at the Distribox
          backend, not the dashboard.
        </Note>
      </Step>

      <Step n={n(3)} title="Run the setup script">
        <p>
          From the root of the repository. It installs libvirt and QEMU,
          creates the distribox and libvirt groups, adds your user to them and
          prepares the host directories. It asks for your password when it
          needs sudo.
        </p>
        <CodeBlock code="./setup.sh" copyLabel="Command copied" />
        <Note tone="warn">
          Run it as the user who will run Distribox, not as root.
        </Note>
        <p className="text-xs">
          Unsupported system? Open an issue on{" "}
          <a
            href="https://github.com/PoCInnovation/Distribox/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            GitHub
          </a>
          .
        </p>
      </Step>

      <Step n={n(4)} title="Pick up the new groups">
        <p>
          Linux: log out and back in. macOS: open a new terminal. To continue
          in the current shell only:
        </p>
        <CodeBlock code="newgrp distribox libvirt" copyLabel="Command copied" />
      </Step>

      <Step n={n(5)} title="Start the slave">
        <CodeBlock
          code="docker compose --profile slave up -d"
          copyLabel="Command copied"
        />
        <p>
          It sends a heartbeat every 30 s. After the first one the node shows
          as <span className="text-success">online</span> here and you can
          provision VMs on it.
        </p>
      </Step>

      <Step n={n(6)} title="Stopping it later">
        <p>
          Always stop it gracefully so VMs are not left as ghosts on the
          master:
        </p>
        <CodeBlock
          code="docker compose --profile slave down"
          copyLabel="Command copied"
        />
      </Step>
    </ol>
  );
}
