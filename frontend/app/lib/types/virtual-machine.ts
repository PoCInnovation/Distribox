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
  ipv4: z.string().nullable(),
  credentials_count: z.number().int().nonnegative(),
});

export type VirtualMachineMetadata = z.infer<
  typeof VirtualMachineMetadataSchema
>;
