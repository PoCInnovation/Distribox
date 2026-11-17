import { z } from "zod";

export const SlaveSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostname: z.string(),
  port: z.number(),
  /** Only returned to users who can register slaves. */
  api_key: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  last_heartbeat: z.string().nullable(),
  total_cpu: z.number(),
  total_mem: z.number(),
  total_disk: z.number(),
  available_cpu: z.number(),
  available_mem: z.number(),
  available_disk: z.number(),
});

export type Slave = z.infer<typeof SlaveSchema>;

export const SlaveListSchema = z.array(SlaveSchema);

export const RegisteredSlaveSchema = SlaveSchema.extend({
  api_key: z.string(),
});

export type RegisteredSlave = z.infer<typeof RegisteredSlaveSchema>;

export type CreateSlavePayload = {
  name: string;
  hostname: string;
  port: number;
};
