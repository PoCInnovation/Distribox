import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, validateWithSchema } from "@/lib/api/core";
import { CreateVMPayloadSchema, type CreateVMPayload } from "@/lib/types";

export interface CreatedVM {
  /** Id of the new VM when the API returned one, otherwise null. */
  id: string | null;
  payload: CreateVMPayload;
}

function readCreatedId(body: unknown): string | null {
  if (body && typeof body === "object" && "id" in body) {
    const id = (body as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }
  return null;
}

export function useCreateVM() {
  const queryClient = useQueryClient();

  return useMutation<CreatedVM, Error, CreateVMPayload>({
    mutationFn: async (payload) => {
      const validated = validateWithSchema(
        CreateVMPayloadSchema,
        payload,
        "/vms",
      );
      const body = await apiRequest("/vms/", {
        method: "POST",
        body: JSON.stringify(validated),
      });
      return { id: readCreatedId(body), payload: validated };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      queryClient.invalidateQueries({ queryKey: ["host"] });
    },
  });
}
