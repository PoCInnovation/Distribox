import type { Route } from "./+types/404";
import { ErrorDisplay } from "@/components/error/error-display";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Page not found - Distribox" }];
}

export default function NotFound() {
  return (
    <ErrorDisplay
      code="404"
      title="Page not found"
      description="The page you asked for does not exist or has moved. Check the address, or head back to the dashboard."
      showGoBack
    />
  );
}
