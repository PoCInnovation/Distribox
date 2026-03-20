import { z } from "zod";

export const SlaveSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostname: z.string(),
  port: z.number(),
  api_key: z.string(),
  status: z.string(),
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

export type CreateSlavePayload = {
  name: string;
  hostname: string;
  port: number;
};
