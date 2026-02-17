import { ErrorDisplay } from "@/components/error/error-display";

export default function UnexpectedErrorPage() {
  return (
    <ErrorDisplay
      code="500"
      title="Unexpected Error"
      description="Something went wrong while processing your request."
      showGoBack
      showRetry
    />
  );
}
