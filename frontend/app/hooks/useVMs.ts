import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createElement, Fragment, useEffect, useMemo, useRef } from "react";
import { PowerOff } from "lucide-react";
import { toast } from "sonner";
import {
  ApiHttpError,
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

const VM_SHUTDOWN_FAILED_CODE = "vm_shutdown_failed";

function formatShutdownToastDescription(message: string): string {
  const cleaned = message
    .replace(/^Could not restart the VM because it\s+/i, "The VM ")
    .replace(/^Could not restart the VM\.\s+/i, "")
    .replace(/\s+(?:Wait a moment, or )?use Force stop to power it off\.$/i, "")
    .replace(/\s+or use Force stop to power it off\.$/i, ".")
    .trim();
  return cleaned || "The VM did not shut down in time.";
}

export type VmOperation =
  | "start"
  | "stop"
  | "forceStop"
  | "restart"
  | "delete"
  | "duplicate"
  | "rename";

const VM_MUTATION_KEY = ["vm-operation"] as const;

interface VmOperationVariables {
  vmId: string;
  op: VmOperation;
  name?: string;
}

export interface UseVMsOptions {
  onRequestForceStop?: (vm: VirtualMachineMetadata) => void;
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
      if (!vars?.vmId) continue;
      if (map.get(vars.vmId) === "forceStop" && vars.op === "stop") continue;
      map.set(vars.vmId, vars.op);
    }
    return map;
  }, [pending]);
}

export function useVMs(options?: UseVMsOptions) {
  const queryClient = useQueryClient();
  const onRequestForceStopRef = useRef(options?.onRequestForceStop);
  onRequestForceStopRef.current = options?.onRequestForceStop;

  const mountedRef = useRef(true);
  const actionToastIdsRef = useRef<Set<string | number>>(new Set());
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const toastId of actionToastIdsRef.current) {
        toast.dismiss(toastId);
      }
      actionToastIdsRef.current.clear();
    };
  }, []);

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

  const updateCachedVm = (updated: VirtualMachineMetadata) => {
    queryClient.setQueryData<VirtualMachineMetadata[]>(["vms"], (old) =>
      old?.map((vm) => (vm.id === updated.id ? updated : vm)),
    );
  };

  const operation = useMutation<
    VirtualMachineMetadata | void,
    Error,
    VmOperationVariables
  >({
    mutationKey: VM_MUTATION_KEY,
    mutationFn: async ({ vmId, op, name }) => {
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
          return result;
        }
        case "stop":
          return stopVM(vmId, false);
        case "forceStop":
          return stopVM(vmId, true);
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
    onSuccess: (updated, vars) => {
      if (
        updated &&
        (vars.op === "start" ||
          vars.op === "stop" ||
          vars.op === "forceStop" ||
          vars.op === "restart")
      ) {
        // Apply the returned VM immediately so actions never re-enable against
        // stale state while a background list refetch is still in flight.
        updateCachedVm(updated);
        void invalidate();
        return;
      }
      return invalidate();
    },
    onError: () => {
      // Fire and forget so a slow GET /vms/ refetch never delays error toasts.
      void invalidate();
    },
  });

  const run = (vars: VmOperationVariables) =>
    operation.mutateAsync(vars).catch((err: Error) => {
      const targetVm = queryClient
        .getQueryData<VirtualMachineMetadata[]>(["vms"])
        ?.find((v) => v.id === vars.vmId);
      const opLabel = vars.op === "forceStop" ? "force stop" : vars.op;
      const canOfferForceStop =
        mountedRef.current &&
        (vars.op === "stop" || vars.op === "restart") &&
        err instanceof ApiHttpError &&
        err.code === VM_SHUTDOWN_FAILED_CODE &&
        !!targetVm &&
        !!onRequestForceStopRef.current;

      if (canOfferForceStop) {
        let toastId: string | number | undefined;
        const untrack = () => {
          if (toastId !== undefined) actionToastIdsRef.current.delete(toastId);
        };
        const title =
          vars.op === "restart"
            ? `Couldn't restart ${targetVm.name}`
            : `Couldn't stop ${targetVm.name}`;
        toastId = toast.error(title, {
          description: formatShutdownToastDescription(err.message),
          duration: 12_000,
          onDismiss: untrack,
          onAutoClose: untrack,
          action: {
            label: createElement(
              Fragment,
              null,
              createElement(PowerOff, {
                className: "size-3.5 shrink-0",
                "aria-hidden": true,
              }),
              "Force stop",
            ),
            onClick: () => {
              untrack();
              if (!mountedRef.current || !onRequestForceStopRef.current) {
                return;
              }
              const cached = queryClient.getQueryData<VirtualMachineMetadata[]>(
                ["vms"],
              );
              const latest = cached
                ? cached.find((v) => v.id === vars.vmId)
                : targetVm;
              if (latest) {
                onRequestForceStopRef.current(latest);
              }
            },
          },
          classNames: {
            toast:
              "!grid !grid-cols-[auto_1fr] !items-start !gap-x-3 !gap-y-2.5 !p-4",
            icon: "!m-0 !mt-0.5 !text-destructive",
            content: "!min-w-0 !gap-1",
            title: "!text-[13px] !font-medium !leading-snug !text-foreground",
            description: "!text-xs !leading-relaxed !text-foreground/70",
            actionButton:
              "!col-start-2 !justify-self-start !ml-0 !mt-0.5 !h-7 !gap-1.5 !rounded-none !border !border-destructive/50 !bg-destructive/15 !px-2.5 !text-xs !font-medium !text-destructive-foreground !transition-colors hover:!border-destructive/80 hover:!bg-destructive/25",
          },
        });
        actionToastIdsRef.current.add(toastId);
      } else if (targetVm) {
        toast.error(`Couldn't ${opLabel} ${targetVm.name}`, {
          description: err.message || undefined,
          classNames: {
            toast: "!items-start !gap-3 !p-4",
            icon: "!m-0 !mt-0.5 !text-destructive",
            content: "!min-w-0 !gap-1",
            title: "!text-[13px] !font-medium !leading-snug !text-foreground",
            description: "!text-xs !leading-relaxed !text-foreground/70",
          },
        });
      } else {
        toast.error(err.message || `Could not ${opLabel} the VM`);
      }
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
    stopVM: (vmId: string) => run({ vmId, op: "stop" }).catch(() => {}),
    forceStopVM: (vmId: string) =>
      run({ vmId, op: "forceStop" }).catch(() => {}),
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
