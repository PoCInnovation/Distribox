import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <AuthCard
        title="Sign in to Distribox"
        description="Enter your credentials to access your account"
      >
        <LoginForm />
      </AuthCard>
    </div>
  );
}
