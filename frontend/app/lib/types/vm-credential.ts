import { z } from "zod";

export const VMCredentialIdSchema = z.string().min(1);

export const CreateVMCredentialPayloadSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(1).optional(),
});

export const VMCredentialSchema = z.object({
  id: VMCredentialIdSchema,
  vm_id: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(1),
  created_at: z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid ISO datetime",
    }),
});

export type CreateVMCredentialPayload = z.infer<
  typeof CreateVMCredentialPayloadSchema
>;
export type VMCredential = z.infer<typeof VMCredentialSchema>;
