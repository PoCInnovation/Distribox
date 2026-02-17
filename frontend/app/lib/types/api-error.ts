import { z } from "zod";

export const MissingPoliciesDetailSchema = z.object({
  message: z.string(),
  missing_policies: z.array(z.string()),
});

export const ForbiddenErrorResponseSchema = z.object({
  detail: z.union([z.string(), MissingPoliciesDetailSchema]),
});

export type MissingPoliciesDetail = z.infer<typeof MissingPoliciesDetailSchema>;
export type ForbiddenErrorResponse = z.infer<typeof ForbiddenErrorResponseSchema>;
