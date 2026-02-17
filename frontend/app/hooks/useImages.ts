import { useQuery } from "@tanstack/react-query";
import { getImages } from "@/lib/api";

export function useImages(enabled = true) {
  return useQuery({
    queryKey: ["images"],
    queryFn: getImages,
    enabled,
    retry: false,
  });
}
