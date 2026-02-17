import { Policy, type User } from "@/lib/types";

export type PolicyName = Policy | string;

export function extractPolicyNames(user?: User | null): string[] {
  if (!user) {
    return [];
  }

  return user.policies.map((entry) => entry.policy);
}

export function hasPolicy(user: User | null | undefined, policy: PolicyName): boolean {
  const policyNames = extractPolicyNames(user);
  if (policyNames.includes(Policy.ADMIN)) {
    return true;
  }

  return policyNames.includes(policy);
}

export function missingPolicies(
  user: User | null | undefined,
  requiredPolicies: PolicyName | PolicyName[],
): string[] {
  const required = Array.isArray(requiredPolicies)
    ? requiredPolicies
    : [requiredPolicies];

  return required.filter((policy) => !hasPolicy(user, policy));
}

export function hasAllPolicies(
  user: User | null | undefined,
  requiredPolicies: PolicyName | PolicyName[],
): boolean {
  return missingPolicies(user, requiredPolicies).length === 0;
}
