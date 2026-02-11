import { z } from "zod";

export const MetadataSchema = z.object({
  name: z.string(),
  image: z.string(),
  version: z.union([z.string(), z.number()]),
  distribution: z.string(),
  family: z.string(),
  revision: z.number(),
});

export type Metadata = z.infer<typeof MetadataSchema>;
