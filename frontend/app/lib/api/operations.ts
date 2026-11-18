import type { CreateVMPayload, Operation } from "@/lib/types";
import { CreateVMPayloadSchema, OperationSchema } from "@/lib/types";
import { apiRequest, validateWithSchema } from "./core";

/**
 * Parse one operation, or null when its shape is unknown. The list is polled
 * from every dashboard page, so a malformed or future kind of operation must
 * not trip the global validation error page.
 */
function toOperation(raw: unknown): Operation | null {
  const parsed = OperationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function getOperations(): Promise<Operation[]> {
  const body = await apiRequest<unknown>("/operations/");
  if (!Array.isArray(body)) return [];
  return body.map(toOperation).filter((op): op is Operation => op !== null);
}

export async function dismissOperation(id: string): Promise<void> {
  await apiRequest<void>(`/operations/${id}`, { method: "DELETE" });
}

/** Starts a VM creation. The VM itself only exists once the operation ends. */
export async function createVM(payload: CreateVMPayload): Promise<Operation> {
  const validated = validateWithSchema(CreateVMPayloadSchema, payload, "/vms");
  const body = await apiRequest<unknown>("/vms/", {
    method: "POST",
    body: JSON.stringify(validated),
  });
  return validateWithSchema(OperationSchema, body, "/vms");
}
