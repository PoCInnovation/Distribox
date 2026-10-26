import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: ReactNode;
  /** Optional line under the wordmark in the brand panel. */
  tagline?: ReactNode;
  /** Optional content at the bottom of the brand panel. */
  panelFooter?: ReactNode;
  /** Width of the content column. */
  contentClassName?: string;
}

/**
 * Full-screen frame for pages outside the dashboard (sign-in, credential
 * entry, errors). The brand panel carries the same teal gradient as the
 * sidebar so these pages read as the same product.
 */
export function AuthShell({
  children,
  tagline = "Virtual machines for labs, events and CI, served from your own hardware.",
  panelFooter,
  contentClassName,
}: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background md:flex-row">
      <aside className="bg-brand-gradient relative flex shrink-0 flex-col justify-between overflow-hidden border-b border-border md:w-[42%] md:max-w-xl md:border-b-0 md:border-r">
        <div className="relative z-10 p-6 md:p-10">
          <Link to="/" className="inline-flex items-center gap-3">
            <img src="/favicon.ico" width={36} height={36} alt="" />
            <span className="font-mono text-xl font-semibold tracking-[0.14em] text-foreground">
              DISTRIBOX
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-foreground/70 md:mt-14 md:text-base">
            {tagline}
          </p>
        </div>
        {panelFooter && (
          <div className="relative z-10 hidden p-10 text-xs text-foreground/45 md:block">
            {panelFooter}
          </div>
        )}
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10 md:px-12">
        <div className={cn("w-full max-w-sm", contentClassName)}>{children}</div>
      </main>
    </div>
  );
}
