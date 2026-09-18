import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getImages, uploadImage } from "@/lib/api";
import type { ImageUploadPayload } from "@/lib/types";

export function useImages(enabled = true) {
  return useQuery({
    queryKey: ["images"],
    queryFn: getImages,
    enabled,
    retry: false,
  });
}

export function useUploadImage(onProgress: (percent: number) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      payload,
    }: {
      file: File;
      payload: ImageUploadPayload;
    }) => uploadImage(file, payload, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}
