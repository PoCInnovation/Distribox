import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2 } from "lucide-react";
import { RecoverableVMCard } from "./recoverable-vm-card";
import type { RecoverableVM } from "@/lib/types";

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recoverableVMs: RecoverableVM[];
  onRecover: (vm: RecoverableVM) => void;
  onClean: (vm: RecoverableVM) => void;
  onCleanAll: () => void;
  isOperating: boolean;
  isCleaningAll: boolean;
}

export function RecoveryDialog({
  open,
  onOpenChange,
  recoverableVMs,
  onRecover,
  onClean,
  onCleanAll,
  isOperating,
  isCleaningAll,
}: RecoveryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl lg:max-w-4xl max-h-[85vh] flex flex-col border-accent/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-accent" />
            VM Recovery Mode
          </DialogTitle>
          <DialogDescription>
            {recoverableVMs.length} untracked VM
            {recoverableVMs.length !== 1 ? "s" : ""} found on disk. Recover them
            to the database or clean them up.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {recoverableVMs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No recoverable VMs found.
            </div>
          ) : (
            recoverableVMs.map((vm) => (
              <RecoverableVMCard
                key={vm.vm_id}
                vm={vm}
                onRecover={onRecover}
                onClean={onClean}
                isOperating={isOperating}
              />
            ))
          )}
        </div>

        {recoverableVMs.length > 1 && (
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={onCleanAll}
              disabled={isCleaningAll || isOperating}
              className="cursor-pointer"
            >
              {isCleaningAll ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Cleaning all...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clean All VMs
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
