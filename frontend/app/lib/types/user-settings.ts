import { z } from "zod";

export const UserSettingsSchema = z.object({
  default_vcpus: z.number().nullable(),
  default_mem: z.number().nullable(),
  default_disk_size: z.number().nullable(),
  default_os: z.string().nullable(),
  default_keyboard_layout: z.string().nullable(),
  timezone: z.string(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

export interface UpdateUserSettingsPayload {
  default_vcpus?: number | null;
  default_mem?: number | null;
  default_disk_size?: number | null;
  default_os?: string | null;
  default_keyboard_layout?: string | null;
  timezone?: string | null;
}
