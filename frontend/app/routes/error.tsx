import { useEffect } from "react";
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
  const forbiddenError =
    searchParams.get("reason") === "forbidden"
      ? getLastForbiddenError()
      : null;
  const validationError =
    searchParams.get("reason") === "validation"
      ? getLastValidationError()
      : null;

  useEffect(() => {
    return () => {
      clearLastValidationError();
      clearLastForbiddenError();
    };
  }, []);

  return (
    <ErrorDisplay
      code={forbiddenError ? "403" : "500"}
      title={
        forbiddenError
          ? "Forbidden"
          : validationError
            ? "Invalid Server Data"
            : "Unexpected Error"
      }
      description={
        forbiddenError
          ? `Access to ${forbiddenError.endpoint} is forbidden.`
          : validationError
            ? `The app received malformed data from ${validationError.endpoint}.`
            : "Something went wrong while processing your request."
      }
      showGoBack
      showRetry={!forbiddenError}
      stack={
        forbiddenError
          ? [
              `Message: ${forbiddenError.message}`,
              `Missing policies: ${forbiddenError.missingPolicies.join(", ") || "none provided"}`,
            ].join("\n")
          : validationError
            ? validationError.issues.join("\n")
            : undefined
      }
    />
  );
}
