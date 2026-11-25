import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Trash2 } from "lucide-react";
import { DashboardVMsTable } from "@/components/dashboard/vms-table";
import { VmDrawer } from "@/components/dashboard/vm-drawer";
import { RenameVMDialog } from "@/components/dashboard/RenameVMDialog";
import { ForceStopDialog } from "@/components/dashboard/force-stop-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useVMs, type VmOperation } from "~/hooks/useVMs";
import { useOperations } from "@/hooks/useOperations";
import {
  VmActionsProvider,
  pendingAllows,
  stateAllows,
  useVmActions,
  type VmActionHandlers,
} from "@/hooks/useVmActions";
import {
  usePaletteSection,
  type PaletteSection,
} from "@/components/command-palette";
import { isForbiddenError } from "@/lib/api";
import type { VirtualMachineMetadata } from "@/lib/types";

const VM_PARAM = "vm";

export function DashboardVMsTableContainer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openVmId = searchParams.get(VM_PARAM);

  const [vmToRename, setVmToRename] = useState<VirtualMachineMetadata | null>(
    null,
  );
  const [deleteDialog, setDeleteDialog] = useState<{
    vms: VirtualMachineMetadata[];
    clearSelection?: () => void;
  }>({ vms: [] });
  const [forceStopDialog, setForceStopDialog] = useState<{
    vms: VirtualMachineMetadata[];
    clearSelection?: () => void;
  }>({ vms: [] });
  const pendingByIdRef = useRef<Map<string, VmOperation>>(new Map());

  const requestForceStop = useCallback((vm: VirtualMachineMetadata) => {
    if (
      !stateAllows("forceStop", vm.state).ok ||
      !pendingAllows("forceStop", pendingByIdRef.current.get(vm.id))
    ) {
      return;
    }
    setForceStopDialog({ vms: [vm] });
  }, []);

  const {
    vms,
    isLoading,
    isError,
    error,
    pendingById,
    startVM,
    stopVM,
    forceStopVM,
    restartVM,
    deleteVM,
    duplicateVM,
    renameVM,
  } = useVMs({ onRequestForceStop: requestForceStop });
  pendingByIdRef.current = pendingById;

  const { operations } = useOperations();
  // Creations still running: their VM isn't in the list until they succeed.
  const creating = useMemo(
    () =>
      operations.filter(
        (op) =>
          op.kind === "vm.create" &&
          op.status === "running" &&
          !vms?.some((vm) => vm.id === op.vm_id),
      ),
    [operations, vms],
  );

  const openVm = useMemo(
    () => (openVmId ? (vms?.find((v) => v.id === openVmId) ?? null) : null),
    [vms, openVmId],
  );

  const setOpenVm = useCallback(
    (vm: VirtualMachineMetadata | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (vm) next.set(VM_PARAM, vm.id);
          else next.delete(VM_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Close the drawer if the VM disappears (deleted, or the deep link is stale).
  useEffect(() => {
    if (openVmId && vms && !vms.some((v) => v.id === openVmId)) {
      setOpenVm(null);
    }
  }, [openVmId, vms, setOpenVm]);

  const handlers = useMemo<VmActionHandlers>(
    () => ({
      connect: (vm) =>
        window.open(`/client?vm_id=${encodeURIComponent(vm.id)}`, "_blank"),
      start: (vm) => void startVM(vm.id),
      stop: (vm) => void stopVM(vm.id),
      forceStop: (vm) => setForceStopDialog({ vms: [vm] }),
      restart: (vm) => void restartVM(vm.id),
      duplicate: (vm) => void duplicateVM(vm.id),
      rename: (vm) => setVmToRename(vm),
      delete: (vm) => setDeleteDialog({ vms: [vm] }),
    }),
    [startVM, stopVM, restartVM, duplicateVM],
  );

  const confirmDelete = () => {
    const { vms: list, clearSelection } = deleteDialog;
    setDeleteDialog({ vms: [] });
    clearSelection?.();
    if (list.some((vm) => vm.id === openVmId)) setOpenVm(null);
    for (const vm of list) void deleteVM(vm.id);
  };

  const confirmForceStop = () => {
    const { vms: list, clearSelection } = forceStopDialog;
    setForceStopDialog({ vms: [] });
    clearSelection?.();
    for (const vm of list) {
      const current = vms ? vms.find((v) => v.id === vm.id) : vm;
      if (
        current &&
        stateAllows("forceStop", current.state).ok &&
        pendingAllows("forceStop", pendingById.get(current.id))
      ) {
        void forceStopVM(current.id);
      }
    }
  };

  const handleBulk = (
    action: "start" | "stop" | "forceStop" | "delete",
    list: VirtualMachineMetadata[],
    clearSelection: () => void,
  ) => {
    if (action === "delete") {
      setDeleteDialog({ vms: list, clearSelection });
      return;
    }
    if (action === "forceStop") {
      setForceStopDialog({ vms: list, clearSelection });
      return;
    }
    for (const vm of list) {
      if (action === "start") void startVM(vm.id);
      else void stopVM(vm.id);
    }
  };

  const deletePending = deleteDialog.vms.some(
    (vm) => pendingById.get(vm.id) === "delete",
  );

  return (
    <VmActionsProvider handlers={handlers} pendingById={pendingById}>
      <div className="pb-10">
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
        ) : isLoading || vms === undefined ? (
          <TableSkeleton />
        ) : (
          <DashboardVMsTable
            vms={vms}
            creating={creating}
            openVmId={openVm?.id ?? null}
            onOpen={(vm) => setOpenVm(vm)}
            onBulk={handleBulk}
          />
        )}
      </div>

      {openVm && <VmPaletteActions vm={openVm} />}

      <VmDrawer
        vm={openVm}
        open={!!openVm}
        onOpenChange={(open) => {
          if (!open) setOpenVm(null);
        }}
      />

      <RenameVMDialog
        open={!!vmToRename}
        onOpenChange={(open) => {
          if (!open) setVmToRename(null);
        }}
        vm={vmToRename}
        onRename={renameVM}
      />

      <ForceStopDialog
        vms={forceStopDialog.vms}
        onOpenChange={(open) => {
          if (!open) setForceStopDialog({ vms: [] });
        }}
        onConfirm={confirmForceStop}
      />

      <ConfirmDialog
        open={deleteDialog.vms.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog({ vms: [] });
        }}
        title={
          deleteDialog.vms.length === 1
            ? "Delete this virtual machine?"
            : `Delete ${deleteDialog.vms.length} virtual machines?`
        }
        description={
          <>
            <p>
              The disk and every credential attached{" "}
              {deleteDialog.vms.length === 1 ? "to it are" : "to them are"}{" "}
              removed permanently. This cannot be undone.
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {deleteDialog.vms.slice(0, 8).map((vm) => (
                <li key={vm.id} className="truncate">
                  {vm.name}
                </li>
              ))}
              {deleteDialog.vms.length > 8 && (
                <li className="text-muted-foreground">
                  and {deleteDialog.vms.length - 8} more
                </li>
              )}
            </ul>
          </>
        }
        confirmLabel={
          <>
            <Trash2 />
            {deleteDialog.vms.length === 1
              ? "Delete VM"
              : `Delete ${deleteDialog.vms.length} VMs`}
          </>
        }
        destructive
        pending={deletePending}
        onConfirm={confirmDelete}
      />
    </VmActionsProvider>
  );
}

/** Puts the open VM's actions at the top of the Ctrl/⌘ K palette. */
function VmPaletteActions({ vm }: { vm: VirtualMachineMetadata }) {
  const { actions } = useVmActions(vm);
  const section = useMemo<PaletteSection>(
    () => ({
      title: `Actions · ${vm.name}`,
      items: actions.map((a) => ({
        id: a.id,
        label: a.label,
        icon: a.icon,
        keywords: vm.name,
        disabled: !a.enabled,
        reason: a.reason,
        destructive: a.destructive,
        run: a.run,
      })),
    }),
    [actions, vm.name],
  );
  usePaletteSection("vm-actions", section);
  return null;
}

function TableSkeleton() {
  return (
    <div
      className="border border-border bg-card"
      aria-busy="true"
      aria-label="Loading virtual machines"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="h-8 w-72 animate-pulse bg-secondary" />
        <div className="h-8 w-80 animate-pulse bg-secondary" />
      </div>
      <div className="divide-y divide-border/70">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex h-[52px] items-center gap-6 px-4">
            <div className="size-4 animate-pulse bg-secondary" />
            <div className="h-3.5 w-40 animate-pulse bg-secondary" />
            <div className="h-3.5 w-20 animate-pulse bg-secondary" />
            <div className="h-3.5 w-48 animate-pulse bg-secondary" />
            <div className="h-3.5 w-32 animate-pulse bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}
