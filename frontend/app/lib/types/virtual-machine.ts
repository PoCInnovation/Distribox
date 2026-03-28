import { z } from "zod";
import { VMStateSchema } from "./vm-state";

export const VirtualMachineMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: VMStateSchema,
  vcpus: z.number().int().nonnegative(),
  mem: z.number().nonnegative(),
  disk_size: z.number().nonnegative(),
  os: z.string(),
  keyboard_layout: z.string().nullable().optional(),
  ipv4: z.string().nullable(),
  credentials_count: z.number().int().nonnegative(),
  slave_id: z.string().nullable().optional(),
  slave_name: z.string().nullable().optional(),
});

export type VirtualMachineMetadata = z.infer<
  typeof VirtualMachineMetadataSchema
>;
