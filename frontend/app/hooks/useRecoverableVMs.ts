import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRecoverableVMs,
  recoverVM,
  cleanRecoverableVM,
  cleanAllRecoverableVMs,
} from "@/lib/api";
import type { RecoverableVM, RecoverVMPayload } from "@/lib/types";

export function useRecoverableVMs() {
  const queryClient = useQueryClient();

  const {
    data: recoverableVMs,
    isLoading,
    isError,
    error,
  } = useQuery<RecoverableVM[]>({
    queryKey: ["recoverable-vms"],
    queryFn: getRecoverableVMs,
    retry: false,
    refetchInterval: 30000,
  });

  const recoverMutation = useMutation<void, Error, RecoverVMPayload>({
    mutationFn: recoverVM,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recoverable-vms"] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });

  const cleanMutation = useMutation<void, Error, { vmId: string }>({
    mutationFn: ({ vmId }) => cleanRecoverableVM(vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recoverable-vms"] });
    },
  });

  const cleanAllMutation = useMutation<void, Error, void>({
    mutationFn: cleanAllRecoverableVMs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recoverable-vms"] });
    },
  });

  return {
    recoverableVMs: recoverableVMs ?? [],
    isLoading,
    isError,
    error,
    recoverVM: recoverMutation.mutateAsync,
    cleanVM: cleanMutation.mutateAsync,
    cleanAllVMs: cleanAllMutation.mutateAsync,
    isRecovering: recoverMutation.isPending,
    isCleaning: cleanMutation.isPending,
    isCleaningAll: cleanAllMutation.isPending,
  };
}
