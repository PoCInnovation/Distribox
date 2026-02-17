import { useState, useMemo } from "react";
import { Server, Trash2, Settings, Terminal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardVMsTable } from "@/components/dashboard/vms-table";
import { useVMs } from "~/hooks/useVMs";
import { isForbiddenError } from "@/lib/api";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";

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
                description={error instanceof Error ? error.message : "Unknown error"}
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

      <Dialog open={!!selectedVM} onOpenChange={() => setSelectedVM(null)}>
        <DialogContent className="max-w-2xl">
          {selectedVM && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center border border-border bg-secondary">
                    <Server className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="font-mono">
                      {selectedVM.name}
                    </DialogTitle>
                    <DialogDescription>{selectedVM.id}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <Badge
                        variant={
                          selectedVM.state === VMState.RUNNING
                            ? "default"
                            : "secondary"
                        }
                        className={
                          selectedVM.state === VMState.RUNNING
                            ? "border-chart-3 bg-chart-3/10 text-chart-3"
                            : "border-muted bg-muted/10 text-muted-foreground"
                        }
                      >
                        {selectedVM.state}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Operating System
                      </span>
                      <span className="font-mono text-sm">{selectedVM.os}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        IP Address
                      </span>
                      <span className="font-mono text-sm">
                        {selectedVM.ipv4}
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="details" className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <h4 className="mb-2 text-sm font-medium">
                        Compute Resources
                      </h4>
                      <div className="space-y-2 border border-border bg-secondary p-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            vCPU
                          </span>
                          <span className="font-mono text-sm">
                            {selectedVM.vcpus}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            RAM
                          </span>
                          <span className="font-mono text-sm">
                            {selectedVM.mem} GB
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Disk
                          </span>
                          <span className="font-mono text-sm">
                            {selectedVM.disk_size} GB
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-medium">Network</h4>
                      <div className="space-y-2 border border-border bg-secondary p-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Private IP
                          </span>
                          <span className="font-mono text-sm">
                            {selectedVM.ipv4}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSelectedVM(null)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => handleConnectVM(selectedVM, e)}
                >
                  <Terminal className="mr-2 h-4 w-4" />
                  Connect
                </Button>
                <Button onClick={(e) => handleConfigureVM(selectedVM, e)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configure
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
