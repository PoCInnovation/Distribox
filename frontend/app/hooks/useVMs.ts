import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  getVMs,
  startVM,
  stopVM,
  restartVM,
  deleteVM,
  duplicateVM,
  renameVM,
} from "@/lib/api";
import type { VirtualMachineMetadata } from "@/lib/types/virtual-machine";
import { VMState } from "@/lib/types";
import { isTransitional } from "@/lib/vm-state-ui";

export type VmOperation =
  | "start"
  | "stop"
  | "restart"
  | "delete"
  | "duplicate"
  | "rename";

const VM_MUTATION_KEY = ["vm-operation"] as const;

interface VmOperationVariables {
  vmId: string;
  op: VmOperation;
  name?: string;
  force?: boolean;
}

/** Poll faster while any VM is in a transitional state (e.g. Stopping). */
const IDLE_POLL_MS = 10_000;
const BUSY_POLL_MS = 1_500;

/**
 * Pending operations keyed by VM id, read straight from the mutation cache so
 * every consumer (table rows, drawer, bulk bar) agrees on which VM is busy.
 */
export function usePendingVmOperations(): Map<string, VmOperation> {
  const pending = useMutationState<VmOperationVariables>({
    filters: { mutationKey: VM_MUTATION_KEY, status: "pending" },
    select: (mutation) => mutation.state.variables as VmOperationVariables,
  });

  return useMemo(() => {
    const map = new Map<string, VmOperation>();
    for (const vars of pending) {
      if (vars?.vmId) map.set(vars.vmId, vars.op);
    }
    return map;
  }, [pending]);
}

export function useVMs() {
  const queryClient = useQueryClient();

  const {
    data: vms,
    isLoading,
    isError,
    error,
  } = useQuery<VirtualMachineMetadata[]>({
    queryKey: ["vms"],
    queryFn: getVMs,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.some((vm) => isTransitional(vm.state))
        ? BUSY_POLL_MS
        : IDLE_POLL_MS;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vms"] });

  const operation = useMutation<void, Error, VmOperationVariables>({
    mutationKey: VM_MUTATION_KEY,
    mutationFn: async ({ vmId, op, name, force }) => {
      switch (op) {
        case "start": {
          const resuming = vms?.some(
            (vm) => vm.id === vmId && vm.state === VMState.PAUSED,
          );
          const result = await startVM(vmId);
          if (result.recovery_warning) {
            toast.warning(result.recovery_warning, { duration: 15_000 });
          } else if (resuming) {
            toast.success("VM resumed");
          }
          return;
        }
        case "stop":
          return stopVM(vmId, force);
        case "restart":
          return restartVM(vmId);
        case "delete":
          return deleteVM(vmId);
        case "duplicate":
          return duplicateVM(vmId);
        case "rename":
          return renameVM(vmId, name ?? "");
      }
    },
    onSettled: () => invalidate(),
  });

  const run = (vars: VmOperationVariables) =>
    operation.mutateAsync(vars).catch((err: Error) => {
      toast.error(err.message || `Could not ${vars.op} the VM`);
      throw err;
    });

  const pendingById = usePendingVmOperations();

  return {
    vms,
    isLoading,
    isError,
    error,
    pendingById,
    startVM: (vmId: string) => run({ vmId, op: "start" }).catch(() => {}),
    stopVM: (vmId: string, force = false) =>
      run({ vmId, op: "stop", force }).catch(() => {}),
    restartVM: (vmId: string) => run({ vmId, op: "restart" }).catch(() => {}),
    deleteVM: (vmId: string) =>
      run({ vmId, op: "delete" })
        .then(() => toast.success("VM deleted"))
        .catch(() => {}),
    duplicateVM: (vmId: string) =>
      toast.promise(operation.mutateAsync({ vmId, op: "duplicate" }), {
        loading: "Duplicating VM…",
        success: "VM duplicated",
        error: (err: Error) => err.message || "Could not duplicate the VM",
      }),
    /** Resolves when renamed; rejects with the API error (dialog shows it). */
    renameVM: (vmId: string, name: string) =>
      operation.mutateAsync({ vmId, op: "rename", name }).then(() => {}),
  };
}
