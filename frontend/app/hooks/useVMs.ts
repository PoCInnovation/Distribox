import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";

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
  });

  const startVMMutation = useMutation<
    void, // Change return type to void
    Error,
    { vmId: string }
  >({
    mutationFn: async ({ vmId }) => {
      await startVM(vmId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const duplicateVMMutation = useMutation<
    void, // Change return type to void
    Error,
    { vmId: string }
  >({
    mutationFn: async ({ vmId }) => {
      await duplicateVM(vmId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const stopVMMutation = useMutation<
    void, // Change return type to void
    Error,
    { vmId: string }
  >({
    mutationFn: async ({ vmId }) => {
      await stopVM(vmId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const restartVMMutation = useMutation<
    void, // Change return type to void
    Error,
    { vmId: string }
  >({
    mutationFn: async ({ vmId }) => {
      await restartVM(vmId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const deleteVMMutation = useMutation<void, Error, { vmId: string }>({
    mutationFn: async ({ vmId }) => {
      await deleteVM(vmId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const renameVMMutation = useMutation<
    void,
    Error,
    { vmId: string; name: string }
  >({
    mutationFn: async ({ vmId, name }) => {
      await renameVM(vmId, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const handleStartVM = (vmId: string) => startVMMutation.mutate({ vmId });
  const handleStopVM = (vmId: string) => stopVMMutation.mutate({ vmId });
  const handleRestartVM = (vmId: string) => restartVMMutation.mutate({ vmId });
  const handleDeleteVM = (vmId: string) => deleteVMMutation.mutate({ vmId });
  const handleDuplicateVM = (vmId: string) =>
    toast.promise(duplicateVMMutation.mutateAsync({ vmId }), {
      loading: "Duplicating VM...",
      success: "VM duplicated successfully",
      error: "Failed to duplicate VM",
    });
  const handleRenameVM = (vmId: string, name: string) =>
    renameVMMutation.mutateAsync({ vmId, name });

  const isMutating =
    startVMMutation.isPending ||
    stopVMMutation.isPending ||
    restartVMMutation.isPending ||
    deleteVMMutation.isPending;

  return {
    vms,
    isLoading,
    isError,
    error,
    startVM: handleStartVM,
    stopVM: handleStopVM,
    restartVM: handleRestartVM,
    deleteVM: handleDeleteVM,
    duplicateVM: handleDuplicateVM,
    renameVM: handleRenameVM,
    isMutating,
    isStartingVM: startVMMutation.isPending,
    isStoppingVM: stopVMMutation.isPending,
    isRestartingVM: restartVMMutation.isPending,
    isDeletingVM: deleteVMMutation.isPending,
    isDuplicatingVM: duplicateVMMutation.isPending,
    isRenamingVM: renameVMMutation.isPending,
  };
}
