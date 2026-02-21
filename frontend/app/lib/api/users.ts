import { z } from "zod";
import type { DeleteUserResponse, User } from "@/lib/types";
import { DeleteUserResponseSchema, UserIdSchema, UserSchema } from "@/lib/types";
import { apiRequest, validateWithSchema } from "./core";

const CreateUserResponseSchema = UserSchema.extend({
  generated_password: z.string().optional(),
});

export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;
export type { DeleteUserResponse };

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
