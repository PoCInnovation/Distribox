import type React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
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
  Copy,
  Pencil,
} from "lucide-react";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { VMState, type VirtualMachineMetadata } from "~/lib/types";

export const TableActionsColumn = ({
  data: vm,
  operatingVMs,
  onStartVM,
  onStopVM,
  onRestartVM,
  onDeleteVM,
  onDuplicateVM,
  onConnectVM,
  onConfigureVM,
  onRenameVM,
}: {
  data?: VirtualMachineMetadata;
  operatingVMs: Set<string>;
  onStartVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onStopVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onRestartVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onDeleteVM?: (vm: VirtualMachineMetadata) => void;
  onDuplicateVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onConnectVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onConfigureVM?: (vm: VirtualMachineMetadata, e?: React.MouseEvent) => void;
  onRenameVM?: (vm: VirtualMachineMetadata) => void;
}) => {
  if (!vm) return null;
  const authz = useAuthz();
  const isOperating = operatingVMs.has(vm.id);
  const missingForConnect = authz.missingPolicies([Policy.VMS_CONNECT]);
  const missingForStart = authz.missingPolicies([Policy.VMS_START]);
  const missingForStop = authz.missingPolicies([Policy.VMS_STOP]);
  const missingForDelete = authz.missingPolicies([Policy.VMS_DELETE]);
  const missingForRestart = authz.missingPolicies([
    Policy.VMS_START,
    Policy.VMS_STOP,
  ]);
  const missingForDuplicate = authz.missingPolicies([Policy.VMS_DUPLICATE]);
  const missingForRename = authz.missingPolicies([Policy.VMS_RENAME]);

  const hiddenActions = [
    ...(missingForConnect.length > 0 ? ["Connect"] : []),
    ...(missingForStart.length > 0 ? ["Start"] : []),
    ...(missingForStop.length > 0 ? ["Stop"] : []),
    ...(missingForRestart.length > 0 ? ["Restart"] : []),
    ...(missingForDuplicate.length > 0 ? ["Duplicate"] : []),
    ...(missingForRename.length > 0 ? ["Rename"] : []),
    ...(missingForDelete.length > 0 ? ["Delete"] : []),
  ];

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
          {hiddenActions.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Hidden actions: {hiddenActions.join(", ")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {onConnectVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={
                (vm.state !== VMState.RUNNING &&
                  vm.state !== VMState.PMSUSPENDED) ||
                missingForConnect.length > 0
              }
              onClick={(e) => onConnectVM(vm, e)}
            >
              <Terminal className="mr-2 h-4 w-4 text-inherit" />
              Connect
              {missingForConnect.length > 0
                ? ` (missing: ${missingForConnect.join(", ")})`
                : ""}
            </DropdownMenuItem>
          )}
          {onStartVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={
                vm.state === VMState.RUNNING || missingForStart.length > 0
              }
              onClick={(e) => onStartVM(vm, e)}
            >
              <Play className="mr-2 h-4 w-4 text-inherit" />
              Start
              {missingForStart.length > 0
                ? ` (missing: ${missingForStart.join(", ")})`
                : ""}
            </DropdownMenuItem>
          )}
          {onStopVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={
                vm.state === VMState.STOPPED || missingForStop.length > 0
              }
              onClick={(e) => onStopVM(vm, e)}
            >
              <Square className="mr-2 h-4 w-4 text-inherit" />
              Stop
              {missingForStop.length > 0
                ? ` (missing: ${missingForStop.join(", ")})`
                : ""}
            </DropdownMenuItem>
          )}
          {onRestartVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={
                vm.state === VMState.STOPPED || missingForRestart.length > 0
              }
              onClick={(e) => onRestartVM(vm, e)}
            >
              <RotateCw className="mr-2 h-4 w-4 text-inherit" />
              Restart
              {missingForRestart.length > 0
                ? ` (missing: ${missingForRestart.join(", ")})`
                : ""}
            </DropdownMenuItem>
          )}
          {onDuplicateVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={
                vm.state === VMState.RUNNING || missingForDuplicate.length > 0
              }
              onClick={(e) => onDuplicateVM(vm, e)}
            >
              <Copy className="mr-2 h-4 w-4 text-inherit" />
              Duplicate
              {missingForDuplicate.length > 0
                ? ` (missing: ${missingForDuplicate.join(", ")})`
                : ""}
            </DropdownMenuItem>
          )}
          {onRenameVM && (
            <DropdownMenuItem
              className="focus:bg-primary/10 focus:text-primary"
              disabled={missingForRename.length > 0}
              onClick={(e) => {
                e.stopPropagation();
                onRenameVM(vm);
              }}
            >
              <Pencil className="mr-2 h-4 w-4 text-inherit" />
              Rename
              {missingForRename.length > 0
                ? ` (missing: ${missingForRename.join(", ")})`
                : ""}
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
                disabled={missingForDelete.length > 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteVM(vm);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Delete
                {missingForDelete.length > 0
                  ? ` (missing: ${missingForDelete.join(", ")})`
                  : ""}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
