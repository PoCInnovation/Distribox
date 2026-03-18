import { useQuery } from "@tanstack/react-query";
import { getHostInfo } from "@/lib/api";

export function useHostInfo(enabled = true, refetchInterval = 1000) {
  return useQuery({
    queryKey: ["host", "info"],
    queryFn: getHostInfo,
    refetchInterval,
    enabled,
    retry: false,
  });
}
