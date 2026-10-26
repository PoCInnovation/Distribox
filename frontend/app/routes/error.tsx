import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ErrorDisplay } from "@/components/error/error-display";
import {
  clearLastForbiddenError,
  clearLastValidationError,
  getLastForbiddenError,
  getLastValidationError,
} from "@/lib/api";

export default function UnexpectedErrorPage() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");
  // Read from sessionStorage after mount so server and client render the same markup.
  const [forbiddenError, setForbiddenError] = useState<ReturnType<
    typeof getLastForbiddenError
  > | null>(null);
  const [validationError, setValidationError] = useState<ReturnType<
    typeof getLastValidationError
  > | null>(null);

  useEffect(() => {
    setForbiddenError(reason === "forbidden" ? getLastForbiddenError() : null);
    setValidationError(
      reason === "validation" ? getLastValidationError() : null,
    );
    return () => {
      clearLastValidationError();
      clearLastForbiddenError();
    };
  }, [reason]);

  return (
    <ErrorDisplay
      code={forbiddenError ? "403" : "500"}
      title={
        forbiddenError
          ? "Not allowed"
          : validationError
            ? "Unexpected server data"
            : "Something went wrong"
      }
      description={
        forbiddenError
          ? `Your account cannot access ${forbiddenError.endpoint}. Ask an administrator for the missing policy.`
          : validationError
            ? `The response from ${validationError.endpoint} did not match what this version of the app expects. The server and the frontend may be out of sync.`
            : "The request could not be completed. Reloading usually fixes it; if not, check the server logs."
      }
      showGoBack
      showRetry={!forbiddenError}
      stack={
        forbiddenError
          ? [
              `message: ${forbiddenError.message}`,
              `missing policies: ${forbiddenError.missingPolicies.join(", ") || "none provided"}`,
            ].join("\n")
          : validationError
            ? validationError.issues.join("\n")
            : undefined
      }
    />
  );
}
