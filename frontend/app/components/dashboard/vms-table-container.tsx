import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Trash2 } from "lucide-react";
import { DashboardVMsTable } from "@/components/dashboard/vms-table";
import { VmDrawer } from "@/components/dashboard/vm-drawer";
import { RenameVMDialog } from "@/components/dashboard/RenameVMDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useVMs } from "~/hooks/useVMs";
import { VmActionsProvider, type VmActionHandlers } from "@/hooks/useVmActions";
import { isForbiddenError } from "@/lib/api";
import type { VirtualMachineMetadata } from "@/lib/types";

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

  const [vmToRename, setVmToRename] = useState<VirtualMachineMetadata | null>(null);
  const [vmsToDelete, setVmsToDelete] = useState<VirtualMachineMetadata[]>([]);

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
    for (const vm of list) {
      if (action === "start") void startVM(vm.id);
      else void stopVM(vm.id);
    }
  };

  const deletePending = vmsToDelete.some((vm) => pendingById.get(vm.id) === "delete");

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
            description={error instanceof Error ? error.message : "Unknown error"}
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
            {vmsToDelete.length === 1 ? "Delete VM" : `Delete ${vmsToDelete.length} VMs`}
          </>
        }
        destructive
        pending={deletePending}
        onConfirm={confirmDelete}
      />
    </VmActionsProvider>
  );
}

function TableSkeleton() {
  return (
    <div className="border border-border bg-card" aria-busy="true" aria-label="Loading virtual machines">
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
