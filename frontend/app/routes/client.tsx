import { Link, useSearchParams } from "react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { DesktopDisplay } from "@/components/desktop/DesktopDisplay";
import { getAuthToken } from "@/lib/api";

function ClientFallback({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <AuthShell>
      <section>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/">Enter a credential</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth/login">Sign in</Link>
          </Button>
        </div>
      </section>
    </AuthShell>
  );
}

export default function ClientRoute() {
  const [searchParams] = useSearchParams();
  const credential = searchParams.get("credential") ?? "";
  const vmId = searchParams.get("vm_id") ?? "";
  const profiling =
    import.meta.env.VITE_GLISS_PROFILING === "true" &&
    searchParams.get("profiling") === "1";

  if (vmId.trim()) {
    const token = getAuthToken();
    if (!token) {
      return (
        <ClientFallback
          title="Sign in to open this VM"
          message="Opening a machine by its ID needs a Distribox account. Sign in, then come back to this link."
        />
      );
    }
    return (
      <DesktopDisplay
        key={vmId}
        mode="vm"
        vmId={vmId}
        token={token}
        profiling={profiling}
      />
    );
  }

  if (!credential.trim()) {
    return (
      <ClientFallback
        title="Nothing to connect to"
        message="This link has no credential or VM ID. Paste the credential you were given to open its machine."
      />
    );
  }
  return (
    <DesktopDisplay
      key={credential}
      credential={credential}
      profiling={profiling}
    />
  );
}
