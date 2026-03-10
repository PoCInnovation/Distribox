import { useState } from "react";
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
  const [recoverTarget, setRecoverTarget] = useState<RecoverableVM | null>(null);
  const [cleanTarget, setCleanTarget] = useState<RecoverableVM | null>(null);

  if (isLoading || recoverableVMs.length === 0) return null;

  const handleRecover = (vm: RecoverableVM) => {
    setRecoverTarget(vm);
  };

  const handleClean = (vm: RecoverableVM) => {
    setCleanTarget(vm);
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
      <RecoveryBanner
        count={recoverableVMs.length}
        onOpenRecovery={() => setRecoveryOpen(true)}
      />

      <RecoveryDialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        recoverableVMs={recoverableVMs}
        onRecover={handleRecover}
        onClean={handleClean}
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

      <Dialog open={!!cleanTarget} onOpenChange={(open) => { if (!open) setCleanTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean Recoverable VM</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-mono font-medium">{cleanTarget?.name}</span>{" "}
              from disk? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCleanTarget(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClean}
              disabled={isCleaning}
              className="cursor-pointer"
            >
              {isCleaning ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clean VM
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
