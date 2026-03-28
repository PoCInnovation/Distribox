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

const ClusterTotalsSchema = z.object({
  cpu_count: z.number(),
  mem_total: z.number(),
  mem_available: z.number(),
  disk_total: z.number(),
  disk_available: z.number(),
});

const NodeHostInfoSchema = z.object({
  node_id: z.string().uuid().nullable(),
  node_name: z.string(),
  host_info: HostInfoSchema,
});

export const ClusterHostInfoSchema = z.object({
  nodes: z.array(NodeHostInfoSchema),
  totals: ClusterTotalsSchema,
});

export type ClusterHostInfo = z.infer<typeof ClusterHostInfoSchema>;
export type ClusterTotals = z.infer<typeof ClusterTotalsSchema>;
