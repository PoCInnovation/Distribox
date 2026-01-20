const API_BASE_URL = import.meta.env.VITE_API_DOMAIN || "http://localhost:8080";
const TOKEN_KEY = "auth_token";

/**
 * Check if we're running on the client side
 */
function isClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * Store auth token in localStorage
 */
export function setAuthToken(token: string): void {
  if (isClient()) {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
  if (!isClient()) {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Remove auth token from localStorage
 */
export function clearAuthToken(): void {
  if (isClient()) {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Make an authenticated API request with JWT token
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Add Authorization header if token exists
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // If unauthorized, clear token and redirect to login
    if (response.status === 401) {
      clearAuthToken();
      window.location.href = "/auth/login";
    }

    const error = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

/**
 * Sign out the current user
 */
export function signOut(): void {
  clearAuthToken();
  window.location.href = "/auth/login";
}

/**
 * Login user and store token
 */
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
  setAuthToken(data.access_token);
}

/**
 * Get current user info
 */
export interface User {
  id: string;
  username: string;
  is_admin: boolean;
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>("/auth/me");
}

/**
 * Change the current user's password
 */
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

/**
 * Host information types
 */
export interface HostInfo {
  disk: {
    total: number;
    used: number;
    available: number;
    percent_used: number;
    distribox_used: number;
  };
  mem: {
    total: number;
    used: number;
    available: number;
    percent_used: number;
  };
  cpu: {
    percent_used_total: number;
    percent_used_per_cpu: number[];
    percent_used_per_vm: string[];
    percent_used_total_vms: number;
    cpu_count: number;
  };
}

/**
 * Get host system information
 */
export async function getHostInfo(): Promise<HostInfo> {
  return apiRequest<HostInfo>("/host/info");
}
