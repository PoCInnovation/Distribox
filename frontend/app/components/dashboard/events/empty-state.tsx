import type { ReactNode } from "react";

/** Centered empty state, same shape as the VM table's. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "py-20",
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${className}`}
    >
      <div className="flex size-12 items-center justify-center border border-border bg-secondary text-muted-foreground">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="font-mono text-base font-medium">{title}</p>
        <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}
