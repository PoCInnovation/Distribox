import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ApiHttpError,
  getCurrentUser,
  isAuthenticated,
  isForbiddenError,
  rememberForbiddenError,
} from "@/lib/api";
import { AuthzProvider } from "@/contexts/authz-context";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    retry: false,
    enabled: typeof window !== "undefined" && isAuthenticated(),
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!isAuthenticated()) {
      navigate("/auth/login", { replace: true });
      return;
    }

    if (userQuery.error && isForbiddenError(userQuery.error)) {
      rememberForbiddenError("/auth/me", userQuery.error);
      navigate("/error?reason=forbidden", { replace: true });
      return;
    }

    if (
      userQuery.error &&
      userQuery.error instanceof ApiHttpError &&
      userQuery.error.status === 401
    ) {
      navigate("/auth/login", { replace: true });
      return;
    }
  }, [navigate, userQuery.error]);

  if (!isAuthenticated() || userQuery.isLoading) {
    return null;
  }

  if (userQuery.error) {
    throw userQuery.error;
  }

  if (!userQuery.data) {
    return null;
  }

  return <AuthzProvider user={userQuery.data}>{children}</AuthzProvider>;
}
