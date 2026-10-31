import { useEffect, useState } from "react";
import { Loader2, Monitor, MonitorOff, PanelRight } from "lucide-react";
import { getVmScreenshotUrl } from "@/lib/api/vms";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";
import { getStateUi } from "@/lib/vm-state-ui";
import { useVmActions } from "@/hooks/useVmActions";
import { cn } from "@/lib/utils";
import { VmStatus } from "../vm-status";
import { ParticipantMenu } from "./participant-menu";
import type { ParticipantRow } from "./participants";

const SCREENSHOT_POLL_MS = 3000;

/**
 * One participant's live screen. Hover shows the row's primary action
 * (Connect while running, Start otherwise) and Details, like the Monitor
 * tiles; the footer opens the VM drawer.
 */
export function ParticipantTile({
  row,
  open,
  canScreenshot,
  onOpen,
  onRemove,
}: {
  row: ParticipantRow & { vm: VirtualMachineMetadata };
  open: boolean;
  canScreenshot: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const { vm, participant } = row;
  const { primary, pendingOp } = useVmActions(vm);
  const running = vm.state === VMState.RUNNING;
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!running || !canScreenshot) {
      setSrc(null);
      setFailed(false);
      return;
    }
    const refresh = () =>
      setSrc(`${getVmScreenshotUrl(vm.id)}&t=${Date.now()}`);
    refresh();
    const id = window.setInterval(refresh, SCREENSHOT_POLL_MS);
    return () => window.clearInterval(id);
  }, [vm.id, running, canScreenshot]);

  const ui = getStateUi(vm.state);
  const PrimaryIcon = primary.icon;

  return (
    <article
      aria-label={participant.participant_name}
      className={cn(
        "group/tile relative flex flex-col border bg-card transition-colors",
        open ? "border-primary" : "border-border hover:border-foreground/25",
      )}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
        {running && canScreenshot && src && !failed ? (
          <img
            src={src}
            alt={`${participant.participant_name}'s screen`}
            className="size-full object-contain"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            {running ? (
              <>
                <Monitor className="size-7" />
                <span className="text-xs">
                  {!canScreenshot
                    ? "Screen hidden by policy"
                    : failed
                      ? "Screen capture unavailable"
                      : "Loading screen…"}
                </span>
              </>
            ) : (
              <>
                <MonitorOff
                  className={cn(
                    "size-7",
                    ui.tone === "destructive" && "text-destructive/80",
                  )}
                />
                <span className="text-xs">
                  {vm.state === VMState.STOPPED
                    ? "Powered off"
                    : ui.transitional
                      ? `${ui.label}…`
                      : ui.label}
                </span>
              </>
            )}
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
          {primary.enabled && (
            <button
              type="button"
              onClick={() => primary.run()}
              className={cn(
                "inline-flex h-8 items-center gap-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                primary.id === "connect"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-foreground/30 bg-background/80 text-foreground hover:bg-background",
              )}
            >
              {primary.pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PrimaryIcon className="size-4" />
              )}
              {primary.label}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-8 items-center gap-2 border border-foreground/30 bg-background/80 px-3 text-sm text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelRight className="size-4" />
            Details
          </button>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-no-row-click="true"]'))
            return;
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
        }}
        className="flex cursor-pointer items-center gap-3 border-t border-border px-3 py-2.5 transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-mono text-sm font-medium text-foreground"
            title={participant.participant_name}
          >
            {participant.participant_name}
          </p>
          <p
            className="truncate font-mono text-xs text-muted-foreground"
            title={vm.name}
          >
            {vm.name}
          </p>
        </div>
        <VmStatus vm={vm} pendingOp={pendingOp} className="text-[13px]" />
        <ParticipantMenu
          name={participant.participant_name}
          vm={vm}
          onOpen={onOpen}
          onRemove={onRemove}
          className="-mr-1"
        />
      </div>
    </article>
  );
}

/** Tile for a participant whose VM is gone or hidden. */
export function MissingParticipantTile({
  row,
  hidden,
  onRemove,
}: {
  row: ParticipantRow;
  hidden: boolean;
  onRemove?: () => void;
}) {
  return (
    <article className="flex flex-col border border-dashed border-border bg-card/50">
      <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <MonitorOff className="size-7" />
        <span className="text-xs">
          {hidden
            ? "VM details are hidden by your policies"
            : "This participant's VM is disconnected"}
        </span>
      </div>
      <div className="flex items-center gap-3 border-t border-dashed border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium">
            {row.participant.participant_name}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {row.participant.vm_id.slice(0, 8)}
          </p>
        </div>
        {onRemove && !hidden && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Free the seat
          </button>
        )}
      </div>
    </article>
  );
}
