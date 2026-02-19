import { z, ZodError, type ZodType } from "zod";
import type {
  ForbiddenErrorResponse,
  CreateVMPayload,
  DeleteUserResponse,
  HostInfo,
  ImageMetadata,
  MissingPoliciesDetail,
  User,
  VirtualMachineMetadata,
} from "@/lib/types";
import {
  ForbiddenErrorResponseSchema,
  CreateVMPayloadSchema,
  DeleteUserResponseSchema,
  HostInfoSchema,
  ImageMetadataSchema,
  UserIdSchema,
  UserSchema,
  VirtualMachineMetadataSchema,
} from "@/lib/types";

const API_BASE_URL = import.meta.env.VITE_API_DOMAIN || "http://localhost:8080";
const TOKEN_KEY = "auth_token";
const LAST_VALIDATION_ERROR_KEY = "last_validation_error";
const LAST_FORBIDDEN_ERROR_KEY = "last_forbidden_error";
const LoginResponseSchema = z.object({
  access_token: z.string().min(1),
});

export interface LastValidationError {
  endpoint: string;
  issues: string[];
  at: string;
}

export interface LastForbiddenError {
  endpoint: string;
  missingPolicies: string[];
  message: string;
  at: string;
}

export class ApiValidationError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly issues: string[],
  ) {
    super(message);
    this.name = "ApiValidationError";
  }
}

export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly missingPolicies: string[] = [],
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

function redirectToErrorPage(endpoint: string, issues: string[]): void {
  if (!isClient()) {
    return;
  }

  sessionStorage.setItem(
    LAST_VALIDATION_ERROR_KEY,
    JSON.stringify({
      endpoint,
      issues,
      at: new Date().toISOString(),
    }),
  );
  window.location.assign("/error?reason=validation");
}

export function getLastValidationError(): LastValidationError | null {
  if (!isClient()) {
    return null;
  }

  const value = sessionStorage.getItem(LAST_VALIDATION_ERROR_KEY);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as LastValidationError;
    if (
      typeof parsed.endpoint === "string" &&
      Array.isArray(parsed.issues) &&
      typeof parsed.at === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function clearLastValidationError(): void {
  if (!isClient()) {
    return;
  }

  sessionStorage.removeItem(LAST_VALIDATION_ERROR_KEY);
}

function saveLastForbiddenError(
  endpoint: string,
  missingPolicies: string[],
  message: string,
): void {
  if (!isClient()) {
    return;
  }

  sessionStorage.setItem(
    LAST_FORBIDDEN_ERROR_KEY,
    JSON.stringify({
      endpoint,
      missingPolicies,
      message,
      at: new Date().toISOString(),
    }),
  );
}

export function getLastForbiddenError(): LastForbiddenError | null {
  if (!isClient()) {
    return null;
  }

  const value = sessionStorage.getItem(LAST_FORBIDDEN_ERROR_KEY);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as LastForbiddenError;
    if (
      typeof parsed.endpoint === "string" &&
      Array.isArray(parsed.missingPolicies) &&
      typeof parsed.message === "string" &&
      typeof parsed.at === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function clearLastForbiddenError(): void {
  if (!isClient()) {
    return;
  }

  sessionStorage.removeItem(LAST_FORBIDDEN_ERROR_KEY);
}

function toMissingPolicies(detail: ForbiddenErrorResponse["detail"]): string[] {
  if (typeof detail === "string") {
    return [];
  }

  return detail.missing_policies;
}

function toForbiddenMessage(detail: ForbiddenErrorResponse["detail"]): string {
  if (typeof detail === "string") {
    return detail;
  }

  return detail.message;
}

function parseForbiddenDetail(
  payload: unknown,
): MissingPoliciesDetail | string {
  const parsed = ForbiddenErrorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return "Forbidden";
  }

  return parsed.data.detail;
}

export function isForbiddenError(error: unknown): error is ApiHttpError {
  return error instanceof ApiHttpError && error.status === 403;
}

export function rememberForbiddenError(
  endpoint: string,
  error: ApiHttpError,
): void {
  saveLastForbiddenError(endpoint, error.missingPolicies, error.message);
}

function handleValidationError(endpoint: string, error: ZodError): never {
  const issues = formatZodIssues(error);
  redirectToErrorPage(endpoint, issues);
  throw new ApiValidationError("Invalid API payload", endpoint, issues);
}

function validateWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
  endpoint: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    return handleValidationError(endpoint, result.error);
  }
  return result.data;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
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

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  schema?: ZodType<T>,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
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

    const errorPayload = await parseResponseBody(response).catch(() => null);
    if (response.status === 403) {
      const detail = parseForbiddenDetail(errorPayload);
      throw new ApiHttpError(
        toForbiddenMessage(detail),
        403,
        endpoint,
        toMissingPolicies(detail),
      );
    }

    const detail =
      typeof errorPayload === "object" &&
      errorPayload !== null &&
      "detail" in errorPayload &&
      typeof (errorPayload as { detail?: unknown }).detail === "string"
        ? (errorPayload as { detail: string }).detail
        : `HTTP ${response.status}`;
    throw new ApiHttpError(detail, response.status, endpoint);
  }

  const payload = await parseResponseBody(response);

  if (!schema) {
    return payload as T;
  }

  return validateWithSchema(schema, payload, endpoint);
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

export async function getHostInfo(): Promise<HostInfo> {
  return apiRequest("/host/info", {}, HostInfoSchema);
}

export async function getVMs(): Promise<VirtualMachineMetadata[]> {
  return apiRequest("/vms", {}, VirtualMachineMetadataSchema.array());
}

export async function getImages(): Promise<ImageMetadata[]> {
  return apiRequest("/images", {}, ImageMetadataSchema.array());
}

export async function createVM(payload: CreateVMPayload): Promise<void> {
  const validatedPayload = validateWithSchema(
    CreateVMPayloadSchema,
    payload,
    "/vms",
  );

  await apiRequest("/vms", {
    method: "POST",
    body: JSON.stringify(validatedPayload),
  });
}

export async function startVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}/start`, {
    method: "POST",
  });
}

export async function stopVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}/stop`, {
    method: "POST",
  });
}

export async function restartVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}/restart`, {
    method: "POST",
  });
}

export async function deleteVM(id: string): Promise<void> {
  return apiRequest<void>(`/vms/${id}`, {
    method: "DELETE",
  });
}

const CreateUserResponseSchema = UserSchema.extend({
  generated_password: z.string().optional(),
});

export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;

export async function getUsers(): Promise<User[]> {
  return apiRequest("/users", {}, UserSchema.array());
}

export async function createUser(
  username: string,
  password?: string,
  policies: string[] = [],
): Promise<CreateUserResponse> {
  return apiRequest(
    "/users",
    {
      method: "POST",
      body: JSON.stringify({
        user: username,
        ...(password && { password }),
        policies,
      }),
    },
    CreateUserResponseSchema,
  );
}

export async function updateUserPolicies(
  userId: string,
  policies: string[],
): Promise<User> {
  const validatedUserId = validateWithSchema(UserIdSchema, userId, "/users/:id");
  return apiRequest(
    `/users/${validatedUserId}/policies`,
    {
      method: "POST",
      body: JSON.stringify({
        policies,
      }),
    },
    UserSchema,
  );
}

export async function getUserPassword(userId: string): Promise<string> {
  const validatedUserId = validateWithSchema(UserIdSchema, userId, "/users/:id");
  const response = await apiRequest<{ password: string }>(
    `/users/${validatedUserId}/password`,
    {},
    z.object({ id: z.string(), user: z.string(), password: z.string() }),
  );
  return response.password;
}

export async function deleteUser(userId: string): Promise<DeleteUserResponse> {
  const validatedUserId = validateWithSchema(UserIdSchema, userId, "/user/:id");
  return apiRequest(
    `/user/${validatedUserId}`,
    {
      method: "DELETE",
    },
    DeleteUserResponseSchema,
  );
}
