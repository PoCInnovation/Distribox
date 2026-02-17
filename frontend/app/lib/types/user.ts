import { z } from "zod";
import { PolicySchema } from "./policies";

export const PolicyResponseSchema = z.object({
  policy: PolicySchema,
  description: z.string(),
})

export const UserSchema = z.object({
  id: z.string(),
  user: z.string(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  last_activity: z.string().nullish(),
  policies: PolicyResponseSchema.array(),
});

export type User = z.infer<typeof UserSchema>;
