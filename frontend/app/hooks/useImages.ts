import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getImages, prepareImage } from "@/lib/api";
import {
  getImageUploads,
  subscribeImageUploads,
  type ImageUpload,
} from "@/lib/image-uploads";

const NO_UPLOADS: ImageUpload[] = [];

export function useImages(enabled = true) {
  return useQuery({
    queryKey: ["images"],
    queryFn: getImages,
    enabled,
    retry: false,
  });
}

/** Uploads started from this tab, newest first. */
export function useImageUploads(): ImageUpload[] {
  return useSyncExternalStore(
    subscribeImageUploads,
    getImageUploads,
    () => NO_UPLOADS,
  );
}

export function usePrepareImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: prepareImage,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["images"] }),
  });
}
