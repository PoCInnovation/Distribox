import type { Route } from "./+types/auth.login";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign in - Distribox" }];
}

export default function LoginPage() {
  return (
    <AuthShell panelFooter="Self-hosted on KVM. Your sign-in never leaves this server.">
      <AuthCard
        title="Sign in"
        description="Use the account an administrator created for you."
      >
        <LoginForm />
      </AuthCard>
    </AuthShell>
  );
}
