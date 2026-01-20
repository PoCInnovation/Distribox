import { useQuery } from "@tanstack/react-query";
import { getHostInfo } from "@/lib/api";

export function useHostInfo() {
  return useQuery({
    queryKey: ["host", "info"],
    queryFn: getHostInfo,
    refetchInterval: 2000,
  });
}
