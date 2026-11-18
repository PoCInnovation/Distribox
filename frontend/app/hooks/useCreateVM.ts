import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVM } from "@/lib/api";
import type { CreateVMPayload, Operation } from "@/lib/types";
import { addOperation } from "./useOperations";

/**
 * Starts a VM creation. It resolves as soon as the backend has accepted the
 * job; progress and the outcome come from the operations list.
 */
export function useCreateVM() {
  const queryClient = useQueryClient();

  return useMutation<Operation, Error, CreateVMPayload>({
    mutationFn: createVM,
    onSuccess: (op) => addOperation(queryClient, op),
  });
}
