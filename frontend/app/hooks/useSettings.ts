import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUserSettings, updateUserSettings } from "@/lib/api/settings";
import type { UpdateUserSettingsPayload } from "@/lib/types";

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: getUserSettings,
    enabled,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserSettingsPayload) => updateUserSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });
}
