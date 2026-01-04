import Session from "supertokens-auth-react/recipe/session";

const API_BASE_URL = import.meta.env.VITE_API_DOMAIN || "http://localhost:8000";

/**
 * Make an authenticated API request
 * SuperTokens automatically handles token refresh and includes auth headers
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include", // Important for SuperTokens session cookies
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  return Session.doesSessionExist();
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  await Session.signOut();
  window.location.href = "/auth";
}
