import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HardDriveDownload, Trash2 } from "lucide-react";
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
  const count = recoverableVMs.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 font-mono">
            <HardDriveDownload className="size-4 text-accent" />
            Untracked VMs
          </DialogTitle>
          <DialogDescription>
            {count} VM{count === 1 ? "" : "s"} exist on disk without a database
            record. Recover one to give it a name and resources, or delete its
            files.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {count === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nothing left to recover.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recoverableVMs.map((vm) => (
                <li key={vm.vm_id}>
                  <RecoverableVMCard
                    vm={vm}
                    onRecover={onRecover}
                    onClean={onClean}
                    isOperating={isOperating}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {count > 1 && (
          <DialogFooter className="border-t border-border px-6 py-3 sm:justify-between">
            <p className="self-center text-xs text-muted-foreground">
              Deleting removes the disk images of all {count} VMs.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={onCleanAll}
              disabled={isCleaningAll || isOperating}
            >
              {isCleaningAll ? (
                <>
                  <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Deleting all…
                </>
              ) : (
                <>
                  <Trash2 />
                  Delete all files
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
