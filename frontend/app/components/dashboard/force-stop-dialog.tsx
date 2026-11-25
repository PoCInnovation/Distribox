import { useRef } from "react";
import { PowerOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";

interface ForceStopDialogProps {
  vms: VirtualMachineMetadata[];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ForceStopDialog({
  vms,
  onOpenChange,
  onConfirm,
}: ForceStopDialogProps) {
  // Keep the last non-empty target list while the dialog plays its exit
  // animation so the title and button never flicker to "0 VMs".
  const lastVmsRef = useRef<VirtualMachineMetadata[]>(vms);
  if (vms.length > 0) {
    lastVmsRef.current = vms;
  }
  const displayed = vms.length > 0 ? vms : lastVmsRef.current;

  const single = displayed.length === 1 ? displayed[0] : null;
  const isSinglePaused = single?.state === VMState.PAUSED;
  const hasPaused = displayed.some((vm) => vm.state === VMState.PAUSED);

  return (
    <ConfirmDialog
      open={vms.length > 0}
      onOpenChange={onOpenChange}
      title={
        displayed.length === 1
          ? "Force stop this VM?"
          : `Force stop ${displayed.length} virtual machines?`
      }
      description={
        <>
          {single ? (
            <p>
              {isSinglePaused
                ? "A paused VM cannot shut down normally. Force stopping powers it off immediately and loses unsaved work. Try Resume VM first."
                : "This immediately powers off the VM without waiting for the guest OS to shut down. Any unsaved work inside it will be lost."}
            </p>
          ) : (
            <>
              <p>
                This immediately powers off the selected virtual machines
                without waiting for a graceful shutdown. Any unsaved work inside
                them will be lost.
              </p>
              {hasPaused && (
                <p>Paused VMs can also be recovered with Resume VM instead.</p>
              )}
            </>
          )}
          {single ? (
            <p className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {single.name}
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {displayed.map((vm) => (
                <li key={vm.id} className="truncate">
                  {vm.name}
                </li>
              ))}
            </ul>
          )}
        </>
      }
      confirmLabel={
        <>
          <PowerOff />
          {displayed.length === 1
            ? "Force stop VM"
            : `Force stop ${displayed.length} VMs`}
        </>
      }
      destructive
      onConfirm={onConfirm}
    />
  );
}
