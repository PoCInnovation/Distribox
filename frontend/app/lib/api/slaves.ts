import { apiRequest } from "./core";
import {
  type Slave,
  type CreateSlavePayload,
  SlaveListSchema,
  SlaveSchema,
} from "@/lib/types/slave";
import {
  type VirtualMachineMetadata,
  VirtualMachineMetadataSchema,
} from "@/lib/types/virtual-machine";

export async function getSlaves(): Promise<Slave[]> {
  return apiRequest("/slaves/", {}, SlaveListSchema);
}

export async function getSlave(slaveId: string): Promise<Slave> {
  return apiRequest(`/slaves/${slaveId}`, {}, SlaveSchema);
}

export async function createSlave(payload: CreateSlavePayload): Promise<Slave> {
  return apiRequest(
    "/slaves/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    SlaveSchema,
  );
}

export async function deleteSlave(slaveId: string): Promise<void> {
  await apiRequest(`/slaves/${slaveId}`, {
    method: "DELETE",
  });
}

export async function getUnmanagedVMs(
  slaveId: string,
): Promise<VirtualMachineMetadata[]> {
  return apiRequest(
    `/slaves/${slaveId}/unmanaged-vms`,
    {},
    VirtualMachineMetadataSchema.array(),
  );
}

export async function adoptVM(
  slaveId: string,
  vmId: string,
): Promise<VirtualMachineMetadata> {
  return apiRequest(
    `/slaves/${slaveId}/unmanaged-vms/${vmId}/adopt`,
    { method: "POST" },
    VirtualMachineMetadataSchema,
  );
}
