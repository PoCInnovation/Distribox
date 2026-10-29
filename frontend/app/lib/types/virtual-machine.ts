import { z } from "zod";
import { VMStateSchema } from "./vm-state";

export const VirtualMachineMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: VMStateSchema,
  pause_reason: z.string().nullable().optional(),
  recovery_warning: z.string().nullable().optional(),
  vcpus: z.number().int().nonnegative(),
  mem: z.number().nonnegative(),
  disk_size: z.number().nonnegative(),
  os: z.string(),
  keyboard_layout: z.string().nullable().optional(),
  ipv4: z.string().nullable(),
  credentials_count: z.number().int().nonnegative(),
  ssh_enabled: z.boolean().default(false),
  slave_id: z.string().nullable().optional(),
  slave_name: z.string().nullable().optional(),
});

export type VirtualMachineMetadata = z.infer<
  typeof VirtualMachineMetadataSchema
>;
