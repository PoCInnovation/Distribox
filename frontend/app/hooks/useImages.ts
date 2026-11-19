import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getImages, prepareImage, uploadImage } from "@/lib/api";
import type { ImageUploadPayload } from "@/lib/types";

export function useImages(enabled = true) {
  return useQuery({
    queryKey: ["images"],
    queryFn: getImages,
    enabled,
    retry: false,
  });
}

export function useUploadImage(
  onProgress: (percent: number) => void,
  onPreparing: () => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      payload,
    }: {
      file: File;
      payload: ImageUploadPayload;
    }) => uploadImage(file, payload, onProgress, onPreparing),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

export function usePrepareImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: prepareImage,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["images"] }),
  });
}
