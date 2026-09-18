import type { HostInfo, ClusterHostInfo } from "@/lib/types";
import { HostInfoSchema, ClusterHostInfoSchema } from "@/lib/types";
import { apiRequest } from "./core";

export async function getHostInfo(): Promise<HostInfo> {
  return apiRequest("/host/info", {}, HostInfoSchema);
}

export async function getSlaveHostInfo(slaveId: string): Promise<HostInfo> {
  return apiRequest(`/host/info/slave/${slaveId}`, {}, HostInfoSchema);
}

export async function getClusterHostInfo(): Promise<ClusterHostInfo> {
  return apiRequest("/host/info/cluster", {}, ClusterHostInfoSchema);
}
