import { useState, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardVMsTable } from "@/components/dashboard/vms-table";
import { VMDetailsDialog } from "@/components/dashboard/vm-details-dialog";
import { useVMs } from "~/hooks/useVMs";
import { isForbiddenError } from "@/lib/api";
import { PolicyNotice } from "@/components/policy/policy-notice";
import type { VirtualMachineMetadata } from "@/lib/types";

export function DashboardVMsTableContainer() {
  const [selectedVM, setSelectedVM] = useState<VirtualMachineMetadata | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vmToDelete, setVmToDelete] = useState<VirtualMachineMetadata | null>(
    null,
  );
  const {
    vms,
    isError,
    error,
    startVM,
    stopVM,
    restartVM,
    deleteVM,
    isStartingVM,
    isStoppingVM,
    isRestartingVM,
    isDeletingVM,
  } = useVMs();

  const operatingVMs = useMemo(() => {
    const operating = new Set<string>();
    // Note: This logic assumes only one VM operation can be in progress at a time
    // or that the selectedVM/vmToDelete is the one being operated on.
    // A more robust solution would involve tracking which vmId is currently mutating within the useVMs hook.
    if (isStartingVM && selectedVM) operating.add(selectedVM.id);
    if (isStoppingVM && selectedVM) operating.add(selectedVM.id);
    if (isRestartingVM && selectedVM) operating.add(selectedVM.id);
    if (isDeletingVM && vmToDelete) operating.add(vmToDelete.id);
    return operating;
  }, [
    isStartingVM,
    isStoppingVM,
    isRestartingVM,
    isDeletingVM,
    selectedVM,
    vmToDelete,
  ]);

  const handleStartVM = (vm: VirtualMachineMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    startVM(vm.id);
  };

  const handleStopVM = (vm: VirtualMachineMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    stopVM(vm.id);
  };

  const handleRestartVM = (
    vm: VirtualMachineMetadata,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    restartVM(vm.id);
  };

  const handleDeleteVM = (vm: VirtualMachineMetadata) => {
    setVmToDelete(vm);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!vmToDelete) return;
    deleteVM(vmToDelete.id);
    setDeleteDialogOpen(false);
    setVmToDelete(null);
  };

  const handleConnectVM = (
    vm: VirtualMachineMetadata,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
  };

  const handleConfigureVM = (
    vm: VirtualMachineMetadata,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
  };

  return (
    <>
      <div className="pb-10">
        <Card className="border-border bg-card py-0">
          <div className="p-4">
            {isError && isForbiddenError(error) ? (
              <PolicyNotice
                title="Virtual Machines Hidden"
                missingPolicies={error.missingPolicies}
              />
            ) : isError ? (
              <PolicyNotice
                title="Virtual Machines Unavailable"
                description={
                  error instanceof Error ? error.message : "Unknown error"
                }
                missingPolicies={[]}
              />
            ) : vms !== undefined ? (
              <DashboardVMsTable
                vms={vms}
                operatingVMs={operatingVMs}
                onVMSelect={setSelectedVM}
                onStartVM={handleStartVM}
                onStopVM={handleStopVM}
                onRestartVM={handleRestartVM}
                onDeleteVM={handleDeleteVM}
                onConnectVM={handleConnectVM}
                onConfigureVM={handleConfigureVM}
              />
            ) : null}
          </div>
        </Card>
      </div>

      <VMDetailsDialog
        vm={selectedVM}
        open={!!selectedVM}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVM(null);
          }
        }}
        onConnectVM={handleConnectVM}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Virtual Machine</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-mono font-medium">{vmToDelete?.name}</span>?
              This action cannot be undone and all data will be permanently
              lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete VM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
