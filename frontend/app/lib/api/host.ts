import type { HostInfo } from "@/lib/types";
import { HostInfoSchema } from "@/lib/types";
import { apiRequest } from "./core";

export async function getHostInfo(): Promise<HostInfo> {
  return apiRequest("/host/info", {}, HostInfoSchema);
}
