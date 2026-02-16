import type React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Play,
  Square,
  Trash2,
  Settings,
  Terminal,
  RotateCw,
} from "lucide-react";
import { VMState, type VirtualMachineMetadata } from "~/lib/types";

export const TableActionsColumn = ({
  data: vm,
  operatingVMs,
  onStartVM,
  onStopVM,
  onRestartVM,
  onDeleteVM,
  onConnectVM,
  onConfigureVM,
}: {
  data?: VirtualMachineMetadata;
  operatingVMs: Set<string>;
  onStartVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onStopVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onRestartVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onDeleteVM?: (vm: VirtualMachineMetadata) => void;
  onConnectVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onConfigureVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
}) => {
  if (!vm) return null;
  const isOperating = operatingVMs.has(vm.id);
  return (
    <div
      className="h-full flex items-center justify-end py-2"
      data-no-row-click="true"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            className="hover:bg-primary hover:text-secondary"
            variant="ghost"
            size="icon-sm"
            disabled={isOperating}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onConnectVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              onClick={(e) => onConnectVM(vm, e)}
            >
              <Terminal className="mr-2 h-4 w-4 text-inherit" />
              Connect
            </DropdownMenuItem>
          )}
          {onStartVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={vm.state === VMState.RUNNING}
              onClick={(e) => onStartVM(vm, e)}
            >
              <Play className="mr-2 h-4 w-4 text-inherit" />
              Start
            </DropdownMenuItem>
          )}
          {onStopVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={vm.state === VMState.STOPPED}
              onClick={(e) => onStopVM(vm, e)}
            >
              <Square className="mr-2 h-4 w-4 text-inherit" />
              Stop
            </DropdownMenuItem>
          )}
          {onRestartVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={vm.state === VMState.STOPPED}
              onClick={(e) => onRestartVM(vm, e)}
            >
              <RotateCw className="mr-2 h-4 w-4 text-inherit" />
              Restart
            </DropdownMenuItem>
          )}
          {onConfigureVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              onClick={(e) => onConfigureVM(vm, e)}
            >
              <Settings className="mr-2 h-4 w-4 text-inherit" />
              Configure
            </DropdownMenuItem>
          )}
          {onDeleteVM && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="focus:bg-destructive/10 focus:text-destructive text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteVM(vm);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
