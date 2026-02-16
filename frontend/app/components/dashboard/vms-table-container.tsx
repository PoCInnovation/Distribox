import type React from "react";
import { useState } from "react";

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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Server,
  Trash2,
  Settings,
  Terminal,
  Cpu,
  HardDrive,
  Network,
} from "lucide-react";
import { DashboardVMsTable, type VM } from "@/components/dashboard/vms-table";
import { mockVMs } from "@/lib/mock";

export function DashboardVMsTableContainer() {
  const [selectedVM, setSelectedVM] = useState<VM | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vmToDelete, setVmToDelete] = useState<VM | null>(null);
  const [vms, setVms] = useState(mockVMs);
  const [operatingVMs, setOperatingVMs] = useState<Set<string>>(new Set());

  const handleStartVM = async (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOperatingVMs((prev) => new Set(prev).add(vm.id));

    // TODO: remove
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setVms((prev) =>
      prev.map((v) =>
        v.id === vm.id
          ? {
              ...v,
              status: "running" as const,
              uptime: "0h 0m",
              cpuUsage: 15,
              ramUsage: 25,
            }
          : v,
      ),
    );

    setOperatingVMs((prev) => {
      const next = new Set(prev);
      next.delete(vm.id);
      return next;
    });
  };

  const handleStopVM = async (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOperatingVMs((prev) => new Set(prev).add(vm.id));

    // TODO: remove
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setVms((prev) =>
      prev.map((v) =>
        v.id === vm.id
          ? {
              ...v,
              status: "stopped" as const,
              uptime: "0h",
              cpuUsage: 0,
              ramUsage: 0,
            }
          : v,
      ),
    );

    setOperatingVMs((prev) => {
      const next = new Set(prev);
      next.delete(vm.id);
      return next;
    });
  };

  const handleRestartVM = async (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOperatingVMs((prev) => new Set(prev).add(vm.id));

    // TODO: remove
    await new Promise((resolve) => setTimeout(resolve, 3000));

    setVms((prev) =>
      prev.map((v) => (v.id === vm.id ? { ...v, uptime: "0h 0m" } : v)),
    );

    setOperatingVMs((prev) => {
      const next = new Set(prev);
      next.delete(vm.id);
      return next;
    });
  };

  const handleDeleteVM = (vm: VM) => {
    setVmToDelete(vm);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!vmToDelete) return;

    // TODO: remove
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setVms((prev) => prev.filter((v) => v.id !== vmToDelete.id));
    setDeleteDialogOpen(false);
    setVmToDelete(null);
  };

  const handleConnectVM = (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
  };

  const handleConfigureVM = (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
  };

  return (
    <>
      <div className="pb-10">
        <Card className="border-border bg-card py-0">
          <div className="p-4">
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
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
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
                          selectedVM.status === "running"
                            ? "default"
                            : "secondary"
                        }
                        className={
                          selectedVM.status === "running"
                            ? "border-chart-3 bg-chart-3/10 text-chart-3"
                            : "border-muted bg-muted/10 text-muted-foreground"
                        }
                      >
                        {selectedVM.status}
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
                      <span className="font-mono text-sm">{selectedVM.ip}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Region
                      </span>
                      <span className="text-sm">{selectedVM.region}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Uptime
                      </span>
                      <span className="font-mono text-sm">
                        {selectedVM.uptime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Created
                      </span>
                      <span className="text-sm">{selectedVM.created}</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="metrics" className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">CPU Usage</span>
                      </div>
                      <span className="font-mono text-sm">
                        {selectedVM.cpuUsage}%
                      </span>
                    </div>
                    <Progress value={selectedVM.cpuUsage} />
                    <p className="text-xs text-muted-foreground">
                      {selectedVM.cpu} vCPU allocated
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-chart-2" />
                        <span className="text-sm font-medium">RAM Usage</span>
                      </div>
                      <span className="font-mono text-sm">
                        {selectedVM.ramUsage}%
                      </span>
                    </div>
                    <Progress value={selectedVM.ramUsage} />
                    <p className="text-xs text-muted-foreground">
                      {selectedVM.ram} GB allocated
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-chart-4" />
                        <span className="text-sm font-medium">Disk Usage</span>
                      </div>
                      <span className="font-mono text-sm">
                        {selectedVM.diskUsage}%
                      </span>
                    </div>
                    <Progress value={selectedVM.diskUsage} />
                    <p className="text-xs text-muted-foreground">
                      {selectedVM.disk} GB allocated
                    </p>
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
                            {selectedVM.cpu}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            RAM
                          </span>
                          <span className="font-mono text-sm">
                            {selectedVM.ram} GB
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Disk
                          </span>
                          <span className="font-mono text-sm">
                            {selectedVM.disk} GB
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
                            {selectedVM.ip}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Region
                          </span>
                          <span className="text-sm">{selectedVM.region}</span>
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
