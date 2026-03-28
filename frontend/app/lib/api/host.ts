import type { HostInfo } from "@/lib/types";
import { HostInfoSchema } from "@/lib/types";
import { apiRequest } from "./core";

export async function getHostInfo(): Promise<HostInfo> {
  return apiRequest("/host/info", {}, HostInfoSchema);
}

export async function getSlaveHostInfo(slaveId: string): Promise<HostInfo> {
  return apiRequest(`/host/info/slave/${slaveId}`, {}, HostInfoSchema);
}
