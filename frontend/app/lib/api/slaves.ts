import { apiRequest } from "./core";
import {
  type Slave,
  type CreateSlavePayload,
  SlaveListSchema,
  SlaveSchema,
} from "@/lib/types/slave";

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
