import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  is_admin: z.boolean(),
});

export type User = z.infer<typeof UserSchema>;
