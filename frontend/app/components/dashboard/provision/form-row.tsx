import { cn } from "@/lib/utils";

/**
 * One row of the provisioning ledger: a fixed label gutter on the left,
 * the control on the right. Rows stack with a hairline between them so the
 * page reads as a single sheet rather than a pile of cards.
 */
export function FormRow({
  id,
  label,
  help,
  error,
  children,
  className,
}: {
  id?: string;
  label: string;
  help?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-invalid={error ? "true" : undefined}
      className={cn(
        "grid gap-3 border-t border-border py-6 first:border-t-0 first:pt-0 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-mono text-sm font-bold leading-6 text-foreground">
          {label}
        </h2>
        {help && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {help}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-2 text-xs font-medium text-destructive md:max-w-[8.5rem]"
          >
            {error}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
