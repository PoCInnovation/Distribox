import { z } from "zod";

export const ImageMetadataSchema = z.object({
  name: z.string(),
  virtual_size: z.number(),
  actual_size: z.number(),
});

export type ImageMetadata = z.infer<typeof ImageMetadataSchema>;
