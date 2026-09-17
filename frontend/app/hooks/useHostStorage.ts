import { useQuery } from "@tanstack/react-query";
import { getHostStorage } from "@/lib/api";

export function useHostStorage(slaveId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["host", "storage", slaveId ?? "master"],
    queryFn: () => getHostStorage(slaveId),
    enabled,
    retry: false,
    refetchInterval: 15_000,
  });
}
