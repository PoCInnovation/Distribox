import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { isAuthenticated } from "@/lib/api";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Only check auth on client side
    if (typeof window !== "undefined") {
      if (!isAuthenticated()) {
        navigate("/auth/login", { replace: true });
      } else {
        setIsChecking(false);
      }
    }
  }, [navigate]);

  // Show nothing while checking (prevents flash of content)
  if (isChecking) {
    return null;
  }

  return <>{children}</>;
}
