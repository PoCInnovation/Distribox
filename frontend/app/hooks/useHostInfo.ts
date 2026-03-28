import { useQuery } from "@tanstack/react-query";
import { getHostInfo, getSlaveHostInfo, getClusterHostInfo } from "@/lib/api";

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

export function useClusterHostInfo(enabled = true, refetchInterval = 2000) {
  return useQuery({
    queryKey: ["host", "info", "cluster"],
    queryFn: getClusterHostInfo,
    refetchInterval,
    enabled,
    retry: false,
  });
}
