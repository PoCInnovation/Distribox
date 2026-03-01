import { ErrorDisplay } from "@/components/error/error-display";

export default function NotFound() {
  return (
    <ErrorDisplay
      code="404"
      title="Page Not Found"
      description="The page you requested does not exist or may have been moved."
      showGoBack
    />
  );
}
