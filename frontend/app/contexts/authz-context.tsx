import { createContext, useContext, useMemo, type Context } from "react";
import type { User } from "@/lib/types";
import {
  extractPolicyNames,
  hasAllPolicies,
  hasPolicy,
  missingPolicies,
  type PolicyName,
} from "@/lib/policy-utils";

interface AuthzContextValue {
  user: User;
  policyNames: string[];
  hasPolicy: (policy: PolicyName) => boolean;
  hasAllPolicies: (requiredPolicies: PolicyName | PolicyName[]) => boolean;
  missingPolicies: (requiredPolicies: PolicyName | PolicyName[]) => string[];
}

function getAuthzContext(): Context<AuthzContextValue | null> {
  if (!import.meta.hot) {
    return createContext<AuthzContextValue | null>(null);
  }

  type HotData = { authzContext?: Context<AuthzContextValue | null> };
  const hotData = import.meta.hot.data as HotData;
  if (!hotData.authzContext) {
    // Keep context identity stable across HMR to avoid transient provider/consumer mismatches.
    hotData.authzContext = createContext<AuthzContextValue | null>(null);
  }

  return hotData.authzContext;
}

const AuthzContext = getAuthzContext();

export function AuthzProvider({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const value = useMemo<AuthzContextValue>(() => {
    return {
      user,
      policyNames: extractPolicyNames(user),
      hasPolicy: (policy) => hasPolicy(user, policy),
      hasAllPolicies: (requiredPolicies) =>
        hasAllPolicies(user, requiredPolicies),
      missingPolicies: (requiredPolicies) =>
        missingPolicies(user, requiredPolicies),
    };
  }, [user]);

  return (
    <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>
  );
}

export function useAuthz(): AuthzContextValue {
  const context = useContext(AuthzContext);
  if (!context) {
    throw new Error("useAuthz must be used within an AuthzProvider");
  }

  return context;
}
