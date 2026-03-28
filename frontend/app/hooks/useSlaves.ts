import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSlaves, createSlave, deleteSlave } from "@/lib/api/slaves";
import type { CreateSlavePayload } from "@/lib/types/slave";

export function useSlaves() {
  const queryClient = useQueryClient();

  const slavesQuery = useQuery({
    queryKey: ["slaves"],
    queryFn: getSlaves,
    refetchInterval: 10_000,
  });

  const createSlaveMutation = useMutation({
    mutationFn: (payload: CreateSlavePayload) => createSlave(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slaves"] });
    },
  });

  const deleteSlaveMutation = useMutation({
    mutationFn: (slaveId: string) => deleteSlave(slaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slaves"] });
    },
  });

  return {
    slaves: slavesQuery.data ?? [],
    isLoading: slavesQuery.isLoading,
    error: slavesQuery.error,
    createSlave: createSlaveMutation.mutateAsync,
    isCreating: createSlaveMutation.isPending,
    deleteSlave: deleteSlaveMutation.mutateAsync,
    isDeleting: deleteSlaveMutation.isPending,
  };
}
