import { useEffect, useState } from "react";
import { useRecoverableVMs } from "@/hooks/useRecoverableVMs";
import { RecoveryBanner } from "./recovery-banner";
import { RecoveryDialog } from "./recovery-dialog";
import { RecoverVMDialog } from "./recover-vm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { RecoverableVM } from "@/lib/types";

const DISMISS_KEY = "recovery-notice-dismissed";

function signatureOf(vms: RecoverableVM[]): string {
  return vms
    .map((vm) => vm.vm_id)
    .sort()
    .join(",");
}

export function RecoveryContainer() {
  const {
    recoverableVMs,
    isLoading,
    recoverVM,
    cleanVM,
    cleanAllVMs,
    isRecovering,
    isCleaning,
    isCleaningAll,
  } = useRecoverableVMs();

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoverTarget, setRecoverTarget] = useState<RecoverableVM | null>(
    null,
  );
  const [cleanTarget, setCleanTarget] = useState<RecoverableVM | null>(null);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setDismissedSignature(sessionStorage.getItem(DISMISS_KEY));
  }, []);

  if (isLoading || recoverableVMs.length === 0) return null;

  const signature = signatureOf(recoverableVMs);
  // The notice comes back if the set of untracked VMs changes.
  const dismissed = dismissedSignature === signature;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, signature);
    setDismissedSignature(signature);
  };

  const confirmClean = async () => {
    if (!cleanTarget) return;
    await cleanVM({ vmId: cleanTarget.vm_id });
    setCleanTarget(null);
  };

  const handleCleanAll = async () => {
    await cleanAllVMs();
    setRecoveryOpen(false);
  };

  const isOperating = isRecovering || isCleaning;

  return (
    <>
      {!dismissed && (
        <RecoveryBanner
          count={recoverableVMs.length}
          onOpenRecovery={() => setRecoveryOpen(true)}
          onDismiss={dismiss}
        />
      )}

      <RecoveryDialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        recoverableVMs={recoverableVMs}
        onRecover={setRecoverTarget}
        onClean={setCleanTarget}
        onCleanAll={handleCleanAll}
        isOperating={isOperating}
        isCleaningAll={isCleaningAll}
      />

      <RecoverVMDialog
        vm={recoverTarget}
        open={!!recoverTarget}
        onOpenChange={(open) => {
          if (!open) setRecoverTarget(null);
        }}
        onRecover={recoverVM}
        isRecovering={isRecovering}
      />

      <Dialog
        open={!!cleanTarget}
        onOpenChange={(open) => {
          if (!open) setCleanTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete files for {cleanTarget?.name}?</DialogTitle>
            <DialogDescription>
              The disk image of{" "}
              <span className="font-mono text-foreground">
                {cleanTarget?.name}
              </span>{" "}
              is removed from the host. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCleanTarget(null)}
              disabled={isCleaning}
            >
              Keep files
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClean}
              disabled={isCleaning}
            >
              {isCleaning ? (
                <>
                  <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 />
                  Delete files
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
