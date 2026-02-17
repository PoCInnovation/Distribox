import { z } from "zod";

export const CreateVMPayloadSchema = z.object({
  os: z.string().min(1),
  name: z.string().min(1),
  mem: z.number().int().positive(),
  vcpus: z.number().int().positive(),
  disk_size: z.number().int().positive(),
  activate_at_start: z.boolean(),
});

export type CreateVMPayload = z.infer<typeof CreateVMPayloadSchema>;
