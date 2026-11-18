import { z } from "zod";

export const ImageMetadataSchema = z.object({
  name: z.string(),
  image: z.string(),
  version: z.string(),
  distribution: z.string(),
  family: z.string(),
  revision: z.number(),
  firmware: z.string().optional(),
  min_disk_size: z.number().int().nonnegative().nullish(),
});

export type ImageMetadata = z.infer<typeof ImageMetadataSchema>;

export interface ImageUploadPayload {
  name: string;
  distribution: string;
  version: string;
  firmware: "bios" | "efi";
}

export const ImageUploadStatusSchema = z.object({
  status: z.enum(["converting", "ready", "failed"]),
  detail: z.string().nullable().optional(),
});
