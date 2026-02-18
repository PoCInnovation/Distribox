import { Policy, POLICY_COLORS } from "@/lib/types/policies";

export function getPolicyColor(policy: string) {
  return POLICY_COLORS[policy as Policy] || POLICY_COLORS.default;
}
