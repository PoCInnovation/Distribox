import { z } from "zod";

export const CreateVMPayloadSchema = z.object({
  os: z.string().min(1),
  name: z.string().min(1),
  mem: z.number().int().positive(),
  vcpus: z.number().int().positive(),
  disk_size: z.number().int().positive(),
  storage_id: z.string().min(1).nullable().optional(),
  keyboard_layout: z.string().nullable().optional(),
  activate_at_start: z.boolean(),
  ssh_enabled: z.boolean().default(false),
  slave_id: z.string().uuid().nullable().optional(),
  auto_place: z.boolean().optional(),
});

export type CreateVMPayload = z.infer<typeof CreateVMPayloadSchema>;
