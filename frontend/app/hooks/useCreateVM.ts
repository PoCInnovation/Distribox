import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVM } from "@/lib/api";
import type { CreateVMPayload } from "@/lib/types";

export function useCreateVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateVMPayload) => createVM(payload),
    onSuccess: () => {
      // Invalidate and refetch VMs list
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });
}
