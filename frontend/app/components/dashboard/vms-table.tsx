import type React from "react";
import { useMemo, useRef, useEffect, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridOptions } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Server,
  MoreVertical,
  Play,
  Square,
  Trash2,
  Settings,
  Terminal,
  RotateCw,
  Search,
} from "lucide-react";

export type VM = {
  id: string;
  name: string;
  status: "running" | "stopped";
  cpu: number;
  ram: number;
  disk: number;
  os: string;
  ip: string;
  uptime: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  region: string;
  created: string;
};

interface DashboardVMsTableProps {
  vms: VM[];
  operatingVMs: Set<string>;
  onVMSelect?: (vm: VM) => void;
  onStartVM?: (vm: VM, e?: React.MouseEvent) => void;
  onStopVM?: (vm: VM, e?: React.MouseEvent) => void;
  onRestartVM?: (vm: VM, e?: React.MouseEvent) => void;
  onDeleteVM?: (vm: VM) => void;
  onConnectVM?: (vm: VM, e?: React.MouseEvent) => void;
  onConfigureVM?: (vm: VM, e?: React.MouseEvent) => void;
}

export function DashboardVMsTable({
  vms,
  operatingVMs,
  onVMSelect,
  onStartVM,
  onStopVM,
  onRestartVM,
  onDeleteVM,
  onConnectVM,
  onConfigureVM,
}: DashboardVMsTableProps) {
  const gridRef = useRef<AgGridReact<VM>>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "stopped"
  >("all");

  const filteredVMs = useMemo(() => {
    return vms.filter((vm) => {
      const matchesSearch =
        vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vm.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vm.os.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || vm.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vms, searchQuery, statusFilter]);

  const runningCount = useMemo(
    () => vms.filter((vm) => vm.status === "running").length,
    [vms],
  );
  const stoppedCount = useMemo(
    () => vms.filter((vm) => vm.status === "stopped").length,
    [vms],
  );

  const columnDefs = useMemo<ColDef<VM>[]>(
    () => [
      {
        field: "name",
        headerName: "Virtual Machine",
        flex: 2,
        cellRenderer: (params: any) => {
          if (!params.data) return null;
          const vm = params.data as VM;
          return (
            <div className="flex items-center gap-3 h-full py-2">
              <div className="flex h-10 w-10 items-center justify-center border border-border bg-secondary flex-shrink-0">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-mono font-medium">{vm.name}</p>
                <p className="text-xs text-muted-foreground">{vm.id}</p>
              </div>
            </div>
          );
        },
      },
      {
        field: "status",
        headerName: "Status",
        flex: 1,
        cellRenderer: (params: any) => {
          if (!params.data) return null;
          const vm = params.data as VM;
          const isOperating = operatingVMs.has(vm.id);
          return (
            <div className="h-full flex items-center py-2">
              {isOperating ? (
                <Badge
                  variant="secondary"
                  className="border-muted bg-muted/10 text-muted-foreground"
                >
                  <div className="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  processing
                </Badge>
              ) : (
                <Badge
                  variant={vm.status === "running" ? "default" : "secondary"}
                  className={
                    vm.status === "running"
                      ? "border-chart-3 bg-chart-3/10 text-chart-3"
                      : "border-muted bg-muted/10 text-muted-foreground"
                  }
                >
                  {vm.status}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        field: "os",
        headerName: "Resources",
        flex: 2,
        cellRenderer: (params: any) => {
          if (!params.data) return null;
          const vm = params.data as VM;
          return (
            <div className="space-y-1 py-2">
              <p className="text-sm font-medium">{vm.os}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {vm.cpu} vCPU • {vm.ram} GB RAM • {vm.disk} GB
              </p>
            </div>
          );
        },
      },
      {
        field: "ip",
        headerName: "IP Address",
        flex: 1.5,
        cellRenderer: (params: any) => {
          const vm = params.data as VM;
          return <p className="font-mono text-sm py-2">{vm.ip}</p>;
        },
      },
      {
        field: "uptime",
        headerName: "Uptime",
        flex: 1.5,
        cellRenderer: (params: any) => {
          const vm = params.data as VM;
          return <p className="font-mono text-sm py-2">{vm.uptime}</p>;
        },
      },
      {
        field: "region",
        headerName: "Region",
        flex: 1.5,
        cellRenderer: (params: any) => {
          const vm = params.data as VM;
          return (
            <p className="text-sm text-muted-foreground py-2">{vm.region}</p>
          );
        },
      },
      {
        headerName: "Actions",
        flex: 1,
        sortable: false,
        filter: false,
        cellRenderer: (params: any) => {
          if (!params.data) return null;
          const vm = params.data as VM;
          const isOperating = operatingVMs.has(vm.id);
          return (
            <div className="h-full flex items-center justify-end py-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button variant="ghost" size="icon-sm" disabled={isOperating}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onConnectVM && (
                    <DropdownMenuItem onClick={(e) => onConnectVM(vm, e)}>
                      <Terminal className="mr-2 h-4 w-4" />
                      Connect
                    </DropdownMenuItem>
                  )}
                  {onStartVM && (
                    <DropdownMenuItem
                      disabled={vm.status === "running"}
                      onClick={(e) => onStartVM(vm, e)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Start
                    </DropdownMenuItem>
                  )}
                  {onStopVM && (
                    <DropdownMenuItem
                      disabled={vm.status === "stopped"}
                      onClick={(e) => onStopVM(vm, e)}
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop
                    </DropdownMenuItem>
                  )}
                  {onRestartVM && (
                    <DropdownMenuItem
                      disabled={vm.status === "stopped"}
                      onClick={(e) => onRestartVM(vm, e)}
                    >
                      <RotateCw className="mr-2 h-4 w-4" />
                      Restart
                    </DropdownMenuItem>
                  )}
                  {onConfigureVM && (
                    <DropdownMenuItem onClick={(e) => onConfigureVM(vm, e)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </DropdownMenuItem>
                  )}
                  {onDeleteVM && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteVM(vm);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [
      operatingVMs,
      onStartVM,
      onStopVM,
      onRestartVM,
      onDeleteVM,
      onConnectVM,
      onConfigureVM,
    ],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    [],
  );

  const gridOptions = useMemo<GridOptions<VM>>(
    () => ({
      rowHeight: 72,
      suppressRowClickSelection: false,
      rowSelection: "single",
      onRowClicked: (event) => {
        if (event.data && onVMSelect) {
          onVMSelect(event.data);
        }
      },
    }),
    [onVMSelect],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or OS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
            size="sm"
          >
            All ({vms.length})
          </Button>
          <Button
            variant={statusFilter === "running" ? "default" : "outline"}
            onClick={() => setStatusFilter("running")}
            size="sm"
          >
            Running ({runningCount})
          </Button>
          <Button
            variant={statusFilter === "stopped" ? "default" : "outline"}
            onClick={() => setStatusFilter("stopped")}
            size="sm"
          >
            Stopped ({stoppedCount})
          </Button>
        </div>
      </div>

      {filteredVMs.length === 0 ? (
        <div className="flex items-center justify-center h-[600px] text-muted-foreground">
          <p>No virtual machines found</p>
        </div>
      ) : (
        <div
          className="w-full ag-theme-quartz"
          style={{ height: "600px", width: "100%" }}
        >
          <AgGridReact<VM>
            ref={gridRef}
            theme="legacy"
            rowData={filteredVMs}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
          />
        </div>
      )}
    </div>
  );
}
