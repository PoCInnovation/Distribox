import { HardDriveDownload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecoveryBannerProps {
  count: number;
  onOpenRecovery: () => void;
  onDismiss: () => void;
}

/**
 * Inline notice shown at the top of the overview when VMs exist on disk but
 * are not tracked in the database. It sits in the page flow (not a toast) and
 * can be dismissed for the session.
 */
export function RecoveryBanner({
  count,
  onOpenRecovery,
  onDismiss,
}: RecoveryBannerProps) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 border border-accent/30 border-l-2 border-l-accent bg-accent/8 py-2.5 pl-4 pr-2"
    >
      <HardDriveDownload className="size-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-mono">{count}</span> untracked VM
        {count > 1 ? "s" : ""} found on disk.
        <span className="ml-1 text-muted-foreground">
          Recover {count > 1 ? "them" : "it"} into the database or delete the
          files.
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={onOpenRecovery}
      >
        Review
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss until next session"
        className="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
