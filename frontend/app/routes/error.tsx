import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ErrorDisplay } from "@/components/error/error-display";
import { clearLastValidationError, getLastValidationError } from "@/lib/api";

export default function UnexpectedErrorPage() {
  const [searchParams] = useSearchParams();
  const validationError =
    searchParams.get("reason") === "validation"
      ? getLastValidationError()
      : null;

  useEffect(() => {
    return () => {
      clearLastValidationError();
    };
  }, []);

  return (
    <ErrorDisplay
      code="500"
      title={validationError ? "Invalid Server Data" : "Unexpected Error"}
      description={
        validationError
          ? `The app received malformed data from ${validationError.endpoint}.`
          : "Something went wrong while processing your request."
      }
      showGoBack
      showRetry
      stack={validationError ? validationError.issues.join("\n") : undefined}
    />
  );
}
