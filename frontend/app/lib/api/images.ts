import type { ImageMetadata } from "@/lib/types";
import { ImageMetadataSchema } from "@/lib/types";
import { apiRequest } from "./core";

export async function getImages(): Promise<ImageMetadata[]> {
  return apiRequest("/images", {}, ImageMetadataSchema.array());
}
