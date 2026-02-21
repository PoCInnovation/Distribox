import type React from "react";
import { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridOptions } from "ag-grid-community";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SearchX, X } from "lucide-react";
import { VMState, type VirtualMachineMetadata } from "~/lib/types";
import { TableStateColumn } from "./table-state-column";
import { TableVMColumn } from "./table-vm-column";
import { TableResourcesColumn } from "./table-resources-column";
import { TableIPColumn } from "./table-ip-column";
import { TableActionsColumn } from "./table-actions-column";
import { TableCredentialsColumn } from "./table-credentials-column";

interface ColumnProps {
  data?: VirtualMachineMetadata;
}

interface DashboardVMsTableProps {
  vms: VirtualMachineMetadata[];
  operatingVMs: Set<string>;
  onVMSelect?: (vm: VirtualMachineMetadata) => void;
  onStartVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onStopVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onRestartVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onDeleteVM?: (vm: VirtualMachineMetadata) => void;
  onConnectVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onConfigureVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
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
  const gridRef = useRef<AgGridReact<VirtualMachineMetadata>>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | VMState.RUNNING | VMState.STOPPED
  >("all");

  const filteredVMs = useMemo(() => {
    return vms.filter((vm) => {
      const matchesSearch =
        vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vm.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vm.os.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || vm.state === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vms, searchQuery, statusFilter]);

  const runningCount = useMemo(
    () => vms.filter((vm) => vm.state === VMState.RUNNING).length,
    [vms],
  );
  const stoppedCount = useMemo(
    () => vms.filter((vm) => vm.state === VMState.STOPPED).length,
    [vms],
  );

  const columnDefs = useMemo<ColDef<VirtualMachineMetadata>[]>(
    () => [
      {
        field: "name",
        headerName: "Virtual Machine",
        flex: 2,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: ({ data }: ColumnProps) => <TableVMColumn data={data} />,
      },
      {
        field: "state",
        headerName: "State",
        flex: 1,
        cellRenderer: ({ data }: ColumnProps) => (
          <TableStateColumn data={data} operatingVMs={operatingVMs} />
        ),
      },
      {
        field: "os",
        headerName: "Resources",
        flex: 2,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: ({ data }: ColumnProps) => (
          <TableResourcesColumn data={data} />
        ),
      },
      {
        field: "ipv4",
        headerName: "IP Address",
        flex: 1.5,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: ({ data }: ColumnProps) => <TableIPColumn data={data} />,
      },
      {
        field: "credentials_count",
        headerName: "Credentials",
        flex: 1,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: ({ data }: ColumnProps) => (
          <TableCredentialsColumn data={data} />
        ),
      },
      {
        headerName: "Actions",
        flex: 1,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ColumnProps) => (
          <TableActionsColumn
            data={data}
            operatingVMs={operatingVMs}
            onStartVM={onStartVM}
            onStopVM={onStopVM}
            onRestartVM={onRestartVM}
            onDeleteVM={onDeleteVM}
            onConnectVM={onConnectVM}
            onConfigureVM={onConfigureVM}
          />
        ),
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

  const gridOptions = useMemo<GridOptions<VirtualMachineMetadata>>(
    () => ({
      rowHeight: 72,
      suppressRowClickSelection: false,
      rowSelection: "single",
      onRowClicked: (event) => {
        // Check if click originated from an interactive element that should not trigger row selection
        const target = event.event?.target as HTMLElement;
        if (target?.closest('[data-no-row-click="true"]')) {
          console.log("Row click prevented by data-no-row-click");
          return;
        }
        console.log("Row clicked, opening dialog");
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
            className={searchQuery ? "pl-9 pr-9" : "pl-9"}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
            variant={statusFilter === VMState.RUNNING ? "default" : "outline"}
            onClick={() => setStatusFilter(VMState.RUNNING)}
            size="sm"
          >
            Running ({runningCount})
          </Button>
          <Button
            variant={statusFilter === VMState.STOPPED ? "default" : "outline"}
            onClick={() => setStatusFilter(VMState.STOPPED)}
            size="sm"
          >
            Stopped ({stoppedCount})
          </Button>
        </div>
      </div>

      {filteredVMs.length === 0 ? (
        <div className="flex items-center justify-center h-[500px] text-muted-foreground space-x-2">
          <SearchX />
          <p>No virtual machines found</p>
        </div>
      ) : (
        <div
          className="w-full ag-theme-quartz"
          style={{ height: "500px", width: "100%" }}
        >
          <AgGridReact<VirtualMachineMetadata>
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
