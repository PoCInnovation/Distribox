import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVM, type CreateVMPayload } from "@/lib/api";

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
