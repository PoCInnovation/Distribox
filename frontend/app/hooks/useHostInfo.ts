import { useQuery } from "@tanstack/react-query";
import { getHostInfo } from "@/lib/api";

export function useHostInfo(enabled = true) {
  return useQuery({
    queryKey: ["host", "info"],
    queryFn: getHostInfo,
    refetchInterval: 1000,
    enabled,
    retry: false,
  });
}
