const API_BASE_URL = import.meta.env.VITE_API_DOMAIN || "http://localhost:8080";
const TOKEN_KEY = "auth_token";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function setAuthToken(token: string): void {
  if (isClient()) {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function getAuthToken(): string | null {
  if (!isClient()) {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken(): void {
  if (isClient()) {
    localStorage.removeItem(TOKEN_KEY);
  }
}

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

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
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
  setAuthToken(data.access_token);
}

export interface User {
  id: string;
  username: string;
  is_admin: boolean;
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>("/auth/me");
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

export async function getHostInfo(): Promise<HostInfo> {
  return apiRequest<HostInfo>("/host/info");
}

export interface Image {
  name: string;
  virtual_size: number;
  actual_size: number;
}

export async function getImages(): Promise<Image[]> {
  return apiRequest<Image[]>("/images");
}

export interface CreateVMPayload {
  os: string;
  mem: number;
  vcpus: number;
  disk_size: number;
}

export async function createVM(payload: CreateVMPayload): Promise<void> {
  return apiRequest<void>("/vms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
