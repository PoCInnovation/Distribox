import type { VirtualMachineMetadata } from "@/lib/types";
import { VirtualMachineMetadataSchema } from "@/lib/types";
import { API_BASE_URL, apiRequest, getAuthToken } from "./core";

/**
 * Build the authenticated URL for a VM screenshot image.
 */
export function getVmScreenshotUrl(vmId: string): string {
  const token = getAuthToken();
  return `${API_BASE_URL}/vms/${vmId}/screenshot${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export async function getVMs(): Promise<VirtualMachineMetadata[]> {
  return apiRequest("/vms/", {}, VirtualMachineMetadataSchema.array());
}

export async function startVM(id: string): Promise<VirtualMachineMetadata> {
  return apiRequest(
    `/vms/${id}/start`,
    {
      method: "POST",
    },
    VirtualMachineMetadataSchema,
  );
}

export async function stopVM(
  id: string,
  force = false,
): Promise<VirtualMachineMetadata> {
  return apiRequest(
    `/vms/${id}/stop${force ? "?force=true" : ""}`,
    {
      method: "POST",
    },
    VirtualMachineMetadataSchema,
  );
}

export async function restartVM(id: string): Promise<VirtualMachineMetadata> {
  return apiRequest(
    `/vms/${id}/restart`,
    {
      method: "POST",
    },
    VirtualMachineMetadataSchema,
  );
}

export async function deleteVM(id: string): Promise<void> {
  await apiRequest<void>(`/vms/${id}`, {
    method: "DELETE",
  });
}

export async function duplicateVM(id: string): Promise<void> {
  await apiRequest<void>(`/vms/${id}/duplicate`, {
    method: "POST",
  });
}

export async function renameVM(id: string, name: string): Promise<void> {
  await apiRequest<void>(`/vms/${id}/rename`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
