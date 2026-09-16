import { z } from "zod";
import { apiRequest } from "./core";

const SshSettingsSchema = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  host: z
    .string()
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .nullable(),
  port: z.number().int().min(1).max(65535),
  host_key_fingerprint: z.string().nullable(),
});

const SshConnectionSchema = SshSettingsSchema.extend({
  credential_id: z.string().uuid(),
  vm_name: z.string(),
  expires_at: z
    .string()
    .transform((value) =>
      /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`,
    )
    .nullable(),
});

export function getVMSshSettings(vmId: string) {
  return apiRequest(`/vms/${vmId}/ssh`, {}, SshSettingsSchema);
}

export function updateVMSshSettings(vmId: string, enabled: boolean) {
  return apiRequest(
    `/vms/${vmId}/ssh`,
    { method: "PATCH", body: JSON.stringify({ enabled }) },
    SshSettingsSchema,
  );
}

export function getSshConnection(credential: string, signal?: AbortSignal) {
  return apiRequest(
    "/ssh/connection",
    {
      method: "POST",
      body: JSON.stringify({ credential }),
      public: true,
      signal,
    },
    SshConnectionSchema,
  );
}
