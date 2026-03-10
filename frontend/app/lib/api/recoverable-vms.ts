import type { RecoverableVM, RecoverVMPayload } from "@/lib/types";
import { RecoverableVMSchema } from "@/lib/types";
import { apiRequest } from "./core";

export async function getRecoverableVMs(): Promise<RecoverableVM[]> {
  return apiRequest(
    "/vms/recoverable",
    {},
    RecoverableVMSchema.array(),
  );
}

export async function recoverVM(payload: RecoverVMPayload): Promise<void> {
  await apiRequest("/vms/recover", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cleanRecoverableVM(vmId: string): Promise<void> {
  await apiRequest<void>(`/vms/clean/${vmId}`, {
    method: "DELETE",
  });
}

export async function cleanAllRecoverableVMs(): Promise<void> {
  await apiRequest<void>("/vms/cleanall", {
    method: "DELETE",
  });
}
