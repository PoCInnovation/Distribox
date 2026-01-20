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
import { useHostInfo } from "@/hooks/useHostInfo";
import {
  CompactCPUInfo,
  CompactMemoryInfo,
  CompactDiskInfo,
} from "@/components/dashboard/compact-host-info";

const mockVMs: VM[] = [
  {
    id: "vm-001",
    name: "prod-web-server-01",
    status: "running" as const,
    cpu: 4,
    ram: 8,
    disk: 80,
    os: "Ubuntu 22.04 LTS",
    ip: "192.168.1.10",
    uptime: "14d 6h 23m",
    cpuUsage: 45,
    ramUsage: 62,
    diskUsage: 38,
    region: "us-east-1",
    created: "2024-01-15",
  },
  {
    id: "vm-002",
    name: "dev-database-01",
    status: "running" as const,
    cpu: 8,
    ram: 16,
    disk: 200,
    os: "PostgreSQL 15",
    ip: "192.168.1.11",
    uptime: "7d 12h 45m",
    cpuUsage: 72,
    ramUsage: 85,
    diskUsage: 56,
    region: "us-east-1",
    created: "2024-02-01",
  },
  {
    id: "vm-003",
    name: "staging-api-01",
    status: "stopped" as const,
    cpu: 2,
    ram: 4,
    disk: 40,
    os: "Node.js 20",
    ip: "192.168.1.12",
    uptime: "0h",
    cpuUsage: 0,
    ramUsage: 0,
    diskUsage: 22,
    region: "us-west-2",
    created: "2024-02-10",
  },
  {
    id: "vm-004",
    name: "test-worker-01",
    status: "running" as const,
    cpu: 2,
    ram: 4,
    disk: 40,
    os: "Python 3.11",
    ip: "192.168.1.13",
    uptime: "2d 3h 12m",
    cpuUsage: 28,
    ramUsage: 41,
    diskUsage: 19,
    region: "us-west-2",
    created: "2024-02-15",
  },
  {
    id: "vm-005",
    name: "prod-cache-01",
    status: "running" as const,
    cpu: 4,
    ram: 8,
    disk: 60,
    os: "Redis 7",
    ip: "192.168.1.14",
    uptime: "21d 18h 5m",
    cpuUsage: 15,
    ramUsage: 34,
    diskUsage: 12,
    region: "us-east-1",
    created: "2024-01-20",
  },
  {
    id: "vm-006",
    name: "prod-queue-01",
    status: "running" as const,
    cpu: 2,
    ram: 4,
    disk: 40,
    os: "RabbitMQ 3.12",
    ip: "192.168.1.15",
    uptime: "18d 9h 32m",
    cpuUsage: 22,
    ramUsage: 48,
    diskUsage: 15,
    region: "us-east-1",
    created: "2024-01-25",
  },
  {
    id: "vm-007",
    name: "dev-frontend-01",
    status: "stopped" as const,
    cpu: 2,
    ram: 4,
    disk: 40,
    os: "Next.js 15",
    ip: "192.168.1.16",
    uptime: "0h",
    cpuUsage: 0,
    ramUsage: 0,
    diskUsage: 28,
    region: "us-west-2",
    created: "2024-02-20",
  },
  {
    id: "vm-008",
    name: "monitoring-01",
    status: "running" as const,
    cpu: 4,
    ram: 8,
    disk: 100,
    os: "Grafana + Prometheus",
    ip: "192.168.1.17",
    uptime: "30d 14h 22m",
    cpuUsage: 35,
    ramUsage: 55,
    diskUsage: 42,
    region: "us-east-1",
    created: "2024-01-05",
  },
];

export default function OverviewPage() {
  const [selectedVM, setSelectedVM] = useState<VM | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vmToDelete, setVmToDelete] = useState<VM | null>(null);
  const [vms, setVms] = useState(mockVMs);
  const [operatingVMs, setOperatingVMs] = useState<Set<string>>(new Set());
  const { data: hostInfo } = useHostInfo();

  const totalVMs = vms.length;
  const activeVMs = vms.filter((vm) => vm.status === "running").length;

  const handleStartVM = async (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOperatingVMs((prev) => new Set(prev).add(vm.id));

    // toast({
    //   title: "Starting VM",
    //   description: `${vm.name} is starting up...`,
    // })

    // Simulate API call
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

    // toast({
    //   title: "VM Started",
    //   description: `${vm.name} is now running`,
    // })
  };

  const handleStopVM = async (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOperatingVMs((prev) => new Set(prev).add(vm.id));

    // toast({
    //   title: "Stopping VM",
    //   description: `${vm.name} is shutting down...`,
    // })

    // Simulate API call
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

    // toast({
    //   title: "VM Stopped",
    //   description: `${vm.name} has been stopped`,
    // })
  };

  const handleRestartVM = async (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOperatingVMs((prev) => new Set(prev).add(vm.id));

    // toast({
    //   title: "Restarting VM",
    //   description: `${vm.name} is restarting...`,
    // })

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 3000));

    setVms((prev) =>
      prev.map((v) => (v.id === vm.id ? { ...v, uptime: "0h 0m" } : v)),
    );

    setOperatingVMs((prev) => {
      const next = new Set(prev);
      next.delete(vm.id);
      return next;
    });

    // toast({
    //   title: "VM Restarted",
    //   description: `${vm.name} has been restarted`,
    // })
  };

  const handleDeleteVM = (vm: VM) => {
    setVmToDelete(vm);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!vmToDelete) return;

    // toast({
    //   title: "Deleting VM",
    //   description: `${vmToDelete.name} is being deleted...`,
    // })

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setVms((prev) => prev.filter((v) => v.id !== vmToDelete.id));
    setDeleteDialogOpen(false);
    setVmToDelete(null);

    // toast({
    //   title: "VM Deleted",
    //   description: `${vmToDelete.name} has been permanently deleted`,
    //   variant: "destructive",
    // })
  };

  const handleConnectVM = (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // toast({
    //   title: "Connecting to VM",
    //   description: `Opening SSH connection to ${vm.name}...`,
    // })
  };

  const handleConfigureVM = (vm: VM, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // toast({
    //   title: "Configure VM",
    //   description: `Opening configuration for ${vm.name}`,
    // })
  };

  return (
    <div className="h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground">
          Monitor and manage your virtual machines
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Virtual Machines
              </p>
              <p className="mt-2 font-mono text-3xl font-bold">
                <span className="text-accent">{activeVMs}</span>
                <span className="text-muted-foreground">/</span>
                {totalVMs}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeVMs} active, {totalVMs - activeVMs} stopped
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center border border-border bg-secondary text-primary">
              <Server className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Storage Used
              </p>
              <p className="mt-2 font-mono text-3xl font-bold">
                {hostInfo ? `${hostInfo.disk.used.toFixed(2)} GB` : "..."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hostInfo
                  ? `of ${hostInfo.disk.total.toFixed(2)} GB (${hostInfo.disk.percent_used.toFixed(1)}%)`
                  : "Loading..."}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center border border-border bg-secondary text-chart-4">
              <HardDrive className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      {hostInfo && (
        <div className="mb-8 w-full flex flex-row space-x-2">
          <CompactCPUInfo cpu={hostInfo.cpu} />
          <CompactMemoryInfo mem={hostInfo.mem} />
          <CompactDiskInfo disk={hostInfo.disk} />
        </div>
      )}

      <Card className="border-border bg-card overflow-hidden py-0">
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
    </div>
  );
}
