import type { CreateVMPayload, VirtualMachineMetadata } from "@/lib/types";
import {
  CreateVMPayloadSchema,
  VirtualMachineMetadataSchema,
} from "@/lib/types";
import { apiRequest, validateWithSchema } from "./core";

export async function getVMs(): Promise<VirtualMachineMetadata[]> {
  return apiRequest("/vms", {}, VirtualMachineMetadataSchema.array());
}

export async function createVM(payload: CreateVMPayload): Promise<void> {
  const validatedPayload = validateWithSchema(
    CreateVMPayloadSchema,
    payload,
    "/vms",
  );

  await apiRequest("/vms", {
    method: "POST",
    body: JSON.stringify(validatedPayload),
  });
}

export async function startVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}/start`, {
    method: "POST",
  });
}

export async function stopVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}/stop`, {
    method: "POST",
  });
}

export async function restartVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}/restart`, {
    method: "POST",
  });
}

export async function deleteVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}`, {
    method: "DELETE",
  });
}
