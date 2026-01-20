import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { login } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

console.log("LoginForm module loaded");

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  console.log("LoginForm component mounted");

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    console.log("handleSubmit called - preventing default");
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log("=== Login form submitted ===");
    console.log("Username:", username);
    console.log(
      "Form values - username:",
      username,
      "password length:",
      password.length,
    );

    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("Calling login function...");
      await login(username, password);
      console.log(
        "Login successful! Token stored. Redirecting to dashboard...",
      );

      // Use window.location for a hard navigation to ensure client-side state is fresh
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Login error:", err);
      console.error("Error details:", {
        message: err instanceof Error ? err.message : "Unknown error",
        stack: err instanceof Error ? err.stack : undefined,
      });
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log("Button clicked!");
    e.preventDefault();
    e.stopPropagation();
    handleSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      onSubmitCapture={(e) => e.preventDefault()}
    >
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={isLoading}
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          autoComplete="current-password"
        />
      </div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {error}
        </div>
      )}
      <Button
        type="button"
        className="w-full"
        disabled={isLoading}
        onClick={handleButtonClick}
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
