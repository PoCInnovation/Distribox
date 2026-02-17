import { useAuthz } from "@/contexts/authz-context";
import type { PolicyName } from "@/lib/policy-utils";
import { PolicyNotice } from "./policy-notice";

export function PolicyGate({
  requiredPolicies,
  children,
  fallback,
  title,
}: {
  requiredPolicies: PolicyName | PolicyName[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  title?: string;
}) {
  const authz = useAuthz();
  const missingPolicies = authz.missingPolicies(requiredPolicies);

  if (missingPolicies.length === 0) {
    return <>{children}</>;
  }

  return (
    <>
      {fallback ?? (
        <PolicyNotice
          title={title}
          missingPolicies={missingPolicies}
          compact
        />
      )}
    </>
  );
}
