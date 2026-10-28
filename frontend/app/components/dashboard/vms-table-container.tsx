import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Square, Trash2 } from "lucide-react";
import { DashboardVMsTable } from "@/components/dashboard/vms-table";
import { VmDrawer } from "@/components/dashboard/vm-drawer";
import { RenameVMDialog } from "@/components/dashboard/RenameVMDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useVMs } from "~/hooks/useVMs";
import {
  VmActionsProvider,
  useVmActions,
  type VmActionHandlers,
} from "@/hooks/useVmActions";
import {
  usePaletteSection,
  type PaletteSection,
} from "@/components/command-palette";
import { isForbiddenError } from "@/lib/api";
import { VMState, type VirtualMachineMetadata } from "@/lib/types";

const VM_PARAM = "vm";

export function DashboardVMsTableContainer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openVmId = searchParams.get(VM_PARAM);

  const {
    vms,
    isLoading,
    isError,
    error,
    pendingById,
    startVM,
    stopVM,
    restartVM,
    deleteVM,
    duplicateVM,
    renameVM,
  } = useVMs();

  const [vmToRename, setVmToRename] = useState<VirtualMachineMetadata | null>(
    null,
  );
  const [vmsToDelete, setVmsToDelete] = useState<VirtualMachineMetadata[]>([]);
  const [vmsToStop, setVmsToStop] = useState<VirtualMachineMetadata[]>([]);

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
      stop: (vm) =>
        vm.state === VMState.PAUSED ? setVmsToStop([vm]) : void stopVM(vm.id),
      restart: (vm) => void restartVM(vm.id),
      duplicate: (vm) => void duplicateVM(vm.id),
      rename: (vm) => setVmToRename(vm),
      delete: (vm) => setVmsToDelete([vm]),
    }),
    [startVM, stopVM, restartVM, duplicateVM],
  );

  const confirmDelete = () => {
    const list = vmsToDelete;
    setVmsToDelete([]);
    if (list.some((vm) => vm.id === openVmId)) setOpenVm(null);
    for (const vm of list) void deleteVM(vm.id);
  };

  const handleBulk = (
    action: "start" | "stop" | "delete",
    list: VirtualMachineMetadata[],
  ) => {
    if (action === "delete") {
      setVmsToDelete(list);
      return;
    }
    if (action === "stop" && list.some((vm) => vm.state === VMState.PAUSED)) {
      setVmsToStop(list);
      return;
    }
    for (const vm of list) {
      if (action === "start") void startVM(vm.id);
      else void stopVM(vm.id);
    }
  };

  const deletePending = vmsToDelete.some(
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

      <ConfirmDialog
        open={vmsToStop.length > 0}
        onOpenChange={(open) => {
          if (!open) setVmsToStop([]);
        }}
        title={
          vmsToStop.length === 1 ? "Force stop this VM?" : "Stop these VMs?"
        }
        description={
          <>
            <p>
              A paused VM cannot shut down normally. Force stopping powers it
              off and loses unsaved work. Try Resume VM first.
            </p>
            <p className="font-medium text-foreground">
              {vmsToStop.map((vm) => vm.name).join(", ")}
            </p>
          </>
        }
        confirmLabel={
          <>
            <Square />
            {vmsToStop.length === 1 ? "Force stop VM" : "Stop VMs"}
          </>
        }
        destructive
        onConfirm={() => {
          for (const vm of vmsToStop)
            void stopVM(vm.id, vm.state === VMState.PAUSED);
          setVmsToStop([]);
        }}
      />

      <ConfirmDialog
        open={vmsToDelete.length > 0}
        onOpenChange={(open) => {
          if (!open) setVmsToDelete([]);
        }}
        title={
          vmsToDelete.length === 1
            ? "Delete this virtual machine?"
            : `Delete ${vmsToDelete.length} virtual machines?`
        }
        description={
          <>
            <p>
              The disk and every credential attached{" "}
              {vmsToDelete.length === 1 ? "to it are" : "to them are"} removed
              permanently. This cannot be undone.
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {vmsToDelete.slice(0, 8).map((vm) => (
                <li key={vm.id} className="truncate">
                  {vm.name}
                </li>
              ))}
              {vmsToDelete.length > 8 && (
                <li className="text-muted-foreground">
                  and {vmsToDelete.length - 8} more
                </li>
              )}
            </ul>
          </>
        }
        confirmLabel={
          <>
            <Trash2 />
            {vmsToDelete.length === 1
              ? "Delete VM"
              : `Delete ${vmsToDelete.length} VMs`}
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
