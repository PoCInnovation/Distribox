import { z } from "zod";
import type { User } from "@/lib/types";
import { UserSchema } from "@/lib/types";
import {
  API_BASE_URL,
  apiRequest,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  validateWithSchema,
} from "./core";

const LoginResponseSchema = z.object({
  access_token: z.string().min(1),
});

export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

export function signOut(): void {
  clearAuthToken();
  window.location.href = "/auth/login";
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Login failed" }));
    throw new Error(error.detail || "Login failed");
  }

  const data = await response.json();
  const authPayload = validateWithSchema(
    LoginResponseSchema,
    data,
    "/auth/login",
  );
  setAuthToken(authPayload.access_token);
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest("/auth/me", {}, UserSchema);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiRequest("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}
