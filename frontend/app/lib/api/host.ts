import type {
  HostInfo,
  ClusterHostInfo,
  HostStorage,
  StorageSettings,
  StorageLocationUpdate,
} from "@/lib/types";
import {
  HostInfoSchema,
  ClusterHostInfoSchema,
  HostStorageSchema,
  StorageSettingsSchema,
} from "@/lib/types";
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

export async function getHostStorage(
  slaveId: string | null = null,
): Promise<HostStorage> {
  const query = slaveId ? `?slave_id=${encodeURIComponent(slaveId)}` : "";
  return apiRequest(`/host/storage${query}`, {}, HostStorageSchema);
}

function storageNodeQuery(slaveId: string | null): string {
  return slaveId ? `?slave_id=${encodeURIComponent(slaveId)}` : "";
}

export async function getStorageSettings(
  slaveId: string | null,
): Promise<StorageSettings> {
  return apiRequest(
    `/host/storage/settings${storageNodeQuery(slaveId)}`,
    {},
    StorageSettingsSchema,
  );
}

export async function addStorageLocation(
  slaveId: string | null,
  mountId: string,
): Promise<StorageSettings> {
  return apiRequest(
    `/host/storage/locations${storageNodeQuery(slaveId)}`,
    {
      method: "POST",
      body: JSON.stringify({ mount_id: mountId }),
    },
    StorageSettingsSchema,
  );
}

export async function updateStorageLocation(
  slaveId: string | null,
  locationId: string,
  update: StorageLocationUpdate,
): Promise<StorageSettings> {
  return apiRequest(
    `/host/storage/locations/${encodeURIComponent(locationId)}${storageNodeQuery(slaveId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(update),
    },
    StorageSettingsSchema,
  );
}
