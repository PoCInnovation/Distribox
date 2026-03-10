import { z } from "zod";

export const RecoverableVMSchema = z.object({
  vm_id: z.string(),
  name: z.string(),
  image: z.string(),
  version: z.string(),
  distribution: z.string(),
  family: z.string(),
  revision: z.number().int(),
});

export type RecoverableVM = z.infer<typeof RecoverableVMSchema>;

export interface RecoverVMPayload {
  vm_id: string;
  name: string;
  mem: number;
  vcpus: number;
  disk_size: number;
}
