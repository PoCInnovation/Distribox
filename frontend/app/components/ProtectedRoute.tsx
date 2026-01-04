import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import Session from "supertokens-auth-react/recipe/session";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const sessionExists = await Session.doesSessionExist();
      
      if (!sessionExists) {
        navigate("/auth");
      } else {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
