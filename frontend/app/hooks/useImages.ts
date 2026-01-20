import { useQuery } from "@tanstack/react-query";
import { getImages } from "@/lib/api";

export function useImages() {
  return useQuery({
    queryKey: ["images"],
    queryFn: getImages,
  });
}
