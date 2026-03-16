import { useEffect, useState } from "react";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Monitor, MonitorOff, ExternalLink } from "lucide-react";
import { getVmScreenshotUrl } from "@/lib/api/vms";

const POLL_INTERVAL = 2000;

function stateBadgeClass(state: VMState): string {
  switch (state) {
    case VMState.RUNNING:
      return "border-chart-3 bg-chart-3/10 text-chart-3";
    case VMState.CRASHED:
    case VMState.BLOCKED:
      return "border-destructive bg-destructive/10 text-destructive";
    default:
      return "border-muted bg-muted/10 text-muted-foreground";
  }
}

export function VmMonitorTile({ vm }: { vm: VirtualMachineMetadata }) {
  const isRunning = vm.state === VMState.RUNNING;
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      setScreenshotUrl(null);
      setHasError(false);
      return;
    }

    function refresh() {
      setScreenshotUrl(`${getVmScreenshotUrl(vm.id)}&t=${Date.now()}`);
    }

    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [vm.id, isRunning]);

  const connectUrl = `/client?vm_id=${encodeURIComponent(vm.id)}`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50">
      <div className="relative aspect-video w-full bg-black">
        {isRunning && screenshotUrl && !hasError ? (
          <img
            src={screenshotUrl}
            alt={`${vm.name} screen`}
            className="h-full w-full object-contain"
            onError={() => setHasError(true)}
            onLoad={() => setHasError(false)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            {isRunning ? (
              <>
                <Monitor className="h-8 w-8" />
                <span className="text-xs">Loading...</span>
              </>
            ) : (
              <>
                <MonitorOff className="h-8 w-8" />
                <span className="text-xs">Powered off</span>
              </>
            )}
          </div>
        )}

        {isRunning && (
          <a
            href={connectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <span className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              <ExternalLink className="h-4 w-4" />
              Connect
            </span>
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {vm.name}
        </span>
        <Badge variant="default" className={stateBadgeClass(vm.state)}>
          {vm.state}
        </Badge>
      </div>
    </div>
  );
}
