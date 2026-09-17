import { z } from "zod";

export const StorageLocationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  path: z.string(),
  total_gib: z.number().nonnegative(),
  available_gib: z.number().nonnegative(),
  available: z.boolean(),
  reason: z.string().nullable(),
  enabled: z.boolean().default(true),
  managed: z.boolean().default(false),
});

export const HostStorageSchema = z.object({
  locations: z.array(StorageLocationSchema),
  recommended_id: z.string().nullable(),
});

export type StorageLocation = z.infer<typeof StorageLocationSchema>;
export type HostStorage = z.infer<typeof HostStorageSchema>;

export const StorageCandidateSchema = z.object({
  id: z.string().min(1),
  mount_path: z.string(),
  filesystem: z.string(),
  total_gib: z.number().nonnegative(),
  available_gib: z.number().nonnegative(),
  available: z.boolean(),
  reason: z.string().nullable(),
  configured_storage_id: z.string().nullable(),
});

export const StorageSettingsSchema = z.object({
  locations: z.array(StorageLocationSchema),
  candidates: z.array(StorageCandidateSchema),
  discovery_error: z.string().nullable(),
});

export type StorageSettings = z.infer<typeof StorageSettingsSchema>;
export type StorageLocationUpdate = { name?: string; enabled?: boolean };
