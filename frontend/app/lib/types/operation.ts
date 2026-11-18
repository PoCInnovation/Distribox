import { z } from "zod";

export const OperationStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "interrupted",
]);

export type OperationStatus = z.infer<typeof OperationStatusSchema>;

const VmCreateParamsSchema = z.object({
  os: z.string(),
  name: z.string(),
  mem: z.number(),
  vcpus: z.number(),
  disk_size: z.number(),
  activate_at_start: z.boolean().optional(),
});

export const OperationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: OperationStatusSchema,
  name: z.string(),
  vm_id: z.string().nullable(),
  slave_id: z.string().nullable(),
  slave_name: z.string().nullable(),
  params: VmCreateParamsSchema.partial().nullable().catch(null),
  phases: z.array(z.string()),
  phase: z.string(),
  phase_started_at: z.string(),
  indeterminate: z.boolean(),
  bytes_done: z.number().nullable(),
  bytes_total: z.number().nullable(),
  error: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  finished_at: z.string().nullable(),
});

export type Operation = z.infer<typeof OperationSchema>;
