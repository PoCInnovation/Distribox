import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSlaves, createSlave, deleteSlave } from "@/lib/api/slaves";
import { ApiHttpError } from "@/lib/api/core";
import type { CreateSlavePayload } from "@/lib/types/slave";

export function useSlaves() {
  const queryClient = useQueryClient();

  const slavesQuery = useQuery({
    queryKey: ["slaves"],
    queryFn: getSlaves,
    refetchInterval: 10_000,
    retry: false,
  });

  const createSlaveMutation = useMutation({
    mutationFn: (payload: CreateSlavePayload) => createSlave(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slaves"] });
      queryClient.invalidateQueries({ queryKey: ["host", "info", "cluster"] });
    },
  });

  const deleteSlaveMutation = useMutation({
    mutationFn: (slaveId: string) => deleteSlave(slaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slaves"] });
      queryClient.invalidateQueries({ queryKey: ["host", "info", "cluster"] });
    },
  });

  const error = slavesQuery.error;
  const forbidden =
    error instanceof ApiHttpError && error.status === 403
      ? { missingPolicies: error.missingPolicies, message: error.message }
      : null;

  return {
    slaves: slavesQuery.data ?? [],
    isLoading: slavesQuery.isLoading,
    error,
    forbidden,
    refetch: slavesQuery.refetch,
    isRefetching: slavesQuery.isRefetching,
    dataUpdatedAt: slavesQuery.dataUpdatedAt,
    createSlave: createSlaveMutation.mutateAsync,
    isCreating: createSlaveMutation.isPending,
    deleteSlave: deleteSlaveMutation.mutateAsync,
    isDeleting: deleteSlaveMutation.isPending,
  };
}
