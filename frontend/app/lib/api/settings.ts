import type { UserSettings, UpdateUserSettingsPayload } from "@/lib/types";
import { UserSettingsSchema } from "@/lib/types";
import { apiRequest } from "./core";

export async function getUserSettings(): Promise<UserSettings> {
  return apiRequest("/auth/settings", {}, UserSettingsSchema);
}

export async function updateUserSettings(
  data: UpdateUserSettingsPayload,
): Promise<UserSettings> {
  return apiRequest(
    "/auth/settings",
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    UserSettingsSchema,
  );
}
