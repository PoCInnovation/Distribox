import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecoveryBannerProps {
  count: number;
  onOpenRecovery: () => void;
}

export function RecoveryBanner({ count, onOpenRecovery }: RecoveryBannerProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
      <div className="flex items-center gap-4 rounded-lg border border-accent/50 bg-accent/10 backdrop-blur-sm px-5 py-4 shadow-lg shadow-accent/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20">
          <AlertTriangle className="h-5 w-5 text-accent" />
        </div>
        <div className="mr-2">
          <p className="text-sm font-medium text-foreground">
            {count} untracked VM{count > 1 ? "s" : ""} found
          </p>
          <p className="text-xs text-muted-foreground">
            VMs exist on disk but not in the database
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/80 cursor-pointer"
          onClick={onOpenRecovery}
        >
          Enter Recovery
        </Button>
      </div>
    </div>
  );
}
