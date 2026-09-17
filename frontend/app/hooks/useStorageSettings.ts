import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addStorageLocation,
  getStorageSettings,
  updateStorageLocation,
} from "@/lib/api/host";
import type { StorageLocationUpdate } from "@/lib/types";

type StorageChange =
  | { type: "add"; mountId: string }
  | { type: "update"; locationId: string; update: StorageLocationUpdate };

export function useStorageSettings(slaveId: string | null, nodeName: string) {
  const queryClient = useQueryClient();
  const queryKey = ["host", "storage", "settings", slaveId ?? "master"];
  const query = useQuery({
    queryKey,
    queryFn: () => getStorageSettings(slaveId),
    retry: false,
  });
  const change = useMutation({
    mutationFn: (operation: StorageChange) =>
      operation.type === "add"
        ? addStorageLocation(slaveId, operation.mountId)
        : updateStorageLocation(
            slaveId,
            operation.locationId,
            operation.update,
          ),
    onSuccess: (data, operation) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: ["host", "storage"] });
      toast.success(
        `${operation.type === "add" ? "Storage added" : "Storage updated"} on ${nodeName}`,
      );
    },
  });

  return { query, change };
}
