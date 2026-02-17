import { z } from "zod";

const HostDiskSchema = z.object({
  total: z.number(),
  used: z.number(),
  available: z.number(),
  percent_used: z.number(),
  distribox_used: z.number(),
});

const HostMemorySchema = z.object({
  total: z.number(),
  used: z.number(),
  available: z.number(),
  percent_used: z.number(),
});

const HostCpuSchema = z.object({
  percent_used_total: z.number(),
  percent_used_per_cpu: z.array(z.number()),
  percent_used_per_vm: z.array(z.string()),
  percent_used_total_vms: z.number(),
  cpu_count: z.number().int().nonnegative(),
});

export const HostInfoSchema = z.object({
  disk: HostDiskSchema,
  mem: HostMemorySchema,
  cpu: HostCpuSchema,
});

export type HostInfo = z.infer<typeof HostInfoSchema>;
