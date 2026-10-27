import { Link } from "react-router";
import { ArrowLeft, House, RotateCw } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";

interface ErrorDisplayProps {
  code: string;
  title: string;
  description: string;
  showGoBack?: boolean;
  showRetry?: boolean;
  stack?: string;
}

const TAGLINES: Record<string, string> = {
  "404": "This address does not point to anything on this Distribox.",
  "403": "Your account can sign in, but it is not allowed here.",
};

export function ErrorDisplay({
  code,
  title,
  description,
  showGoBack = false,
  showRetry = false,
  stack,
}: ErrorDisplayProps) {
  return (
    <AuthShell
      tagline={
        TAGLINES[code] ?? "Something on this page did not go as planned."
      }
      contentClassName="max-w-lg"
    >
      <section>
        <p
          aria-hidden
          className="font-mono text-7xl font-bold leading-none tracking-tight text-primary"
        >
          {code}
        </p>
        <h1 className="mt-5 font-mono text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        {stack && (
          <pre className="mt-6 max-h-56 overflow-auto border border-border bg-card p-3 text-left font-mono text-[11px] leading-relaxed text-muted-foreground">
            <code>{stack}</code>
          </pre>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to="/dashboard">
              <House />
              Dashboard
            </Link>
          </Button>
          {showRetry && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RotateCw />
              Try again
            </Button>
          )}
          {showGoBack && (
            <Button variant="ghost" onClick={() => window.history.back()}>
              <ArrowLeft />
              Go back
            </Button>
          )}
        </div>
      </section>
    </AuthShell>
  );
}
