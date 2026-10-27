import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { AlertCircle, ArrowRight } from "lucide-react";
import { login } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!username || !password) {
      setError("Enter your username and password.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(username, password);
      // Hard navigation so client-side state starts fresh with the new token.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sign-in failed. Try again.",
      );
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={isLoading}
          autoComplete="username"
          autoFocus
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          className="h-10 bg-card"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          className="h-10 bg-card"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-destructive/40 border-l-2 border-l-destructive bg-destructive/8 px-3 py-2.5 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      )}

      <Button type="submit" className="h-10 w-full" disabled={isLoading}>
        {isLoading ? "Signing in…" : "Sign in"}
      </Button>

      <p className="pt-2 text-sm text-muted-foreground">
        Have a VM credential instead?{" "}
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          Connect with it
          <ArrowRight className="size-3.5" />
        </Link>
      </p>
    </form>
  );
}
