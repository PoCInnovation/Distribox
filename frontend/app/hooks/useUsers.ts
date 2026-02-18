import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUsers,
  createUser,
  updateUserPolicies,
  getUserPassword,
  type CreateUserResponse,
  isForbiddenError,
  rememberForbiddenError,
} from "@/lib/api";
import type { User } from "@/lib/types";
import { toast } from "sonner";

export function useUsers() {
  const queryClient = useQueryClient();

  const {
    data: users,
    isLoading,
    isError,
    error,
  } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: getUsers,
    retry: false,
  });

  const createUserMutation = useMutation<
    CreateUserResponse,
    Error,
    { username: string; password?: string; policies?: string[] }
  >({
    mutationFn: async ({ username, password, policies }) => {
      return createUser(username, password, policies);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      if (!data.generated_password) {
        toast.success(`User "${data.user}" created successfully!`);
      }
    },
    onError: (error) => {
      if (isForbiddenError(error)) {
        rememberForbiddenError("/users", error);
        toast.error(error.message);
      } else {
        toast.error(`Failed to create user: ${error.message}`);
      }
    },
  });

  const updatePoliciesMutation = useMutation<
    User,
    Error,
    { userId: string; policies: string[] }
  >({
    mutationFn: async ({ userId, policies }) => {
      return updateUserPolicies(userId, policies);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      if (isForbiddenError(error)) {
        rememberForbiddenError(`/users/${error.message}/policies`, error);
        toast.error(error.message);
      } else {
        toast.error(`Failed to update policies: ${error.message}`);
      }
    },
  });

  const getPasswordMutation = useMutation<string, Error, { userId: string }>({
    mutationFn: async ({ userId }) => {
      return getUserPassword(userId);
    },
  });

  const handleCreateUser = (
    username: string,
    password?: string,
    policies?: string[],
  ) => createUserMutation.mutate({ username, password, policies });

  const handleUpdatePolicies = (userId: string, policies: string[]) =>
    updatePoliciesMutation.mutateAsync({ userId, policies });

  const handleGetPassword = (userId: string) =>
    getPasswordMutation.mutateAsync({ userId });

  return {
    users,
    isLoading,
    isError,
    error,
    createUser: handleCreateUser,
    updateUserPolicies: handleUpdatePolicies,
    getUserPassword: handleGetPassword,
    isCreatingUser: createUserMutation.isPending,
    isUpdatingPolicies: updatePoliciesMutation.isPending,
    createUserData: createUserMutation.data,
    createUserError: createUserMutation.error,
    resetCreateUser: createUserMutation.reset,
  };
}
