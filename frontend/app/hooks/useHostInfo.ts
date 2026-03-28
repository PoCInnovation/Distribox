import { useQuery } from "@tanstack/react-query";
import { getHostInfo, getSlaveHostInfo } from "@/lib/api";

export function useHostInfo(enabled = true, refetchInterval = 1000) {
  return useQuery({
    queryKey: ["host", "info"],
    queryFn: getHostInfo,
    refetchInterval,
    enabled,
    retry: false,
  });
}

export function useTargetHostInfo(
  slaveId: string | null,
  enabled = true,
  refetchInterval = 1000,
) {
  return useQuery({
    queryKey: ["host", "info", slaveId ?? "master"],
    queryFn: () =>
      slaveId ? getSlaveHostInfo(slaveId) : getHostInfo(),
    refetchInterval,
    enabled,
    retry: false,
  });
}
