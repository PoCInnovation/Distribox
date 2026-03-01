import { useState, useMemo, useEffect } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { useUsers } from "@/hooks/useUsers";
import { POLICY_DESCRIPTIONS } from "@/lib/types/policies";

export function useUsersPoliciesPage() {
  const {
    users,
    isLoading,
    createUser,
    updateUserPolicies,
    getUserPassword,
    deleteUser,
    isCreatingUser,
    isDeletingUser,
    createUserData,
    resetCreateUser,
  } = useUsers();

  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [policySearchQuery, setPolicySearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(25);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const allPolicies = useMemo(() => {
    return Object.entries(POLICY_DESCRIPTIONS).map(([policy, description]) => ({
      policy,
      description,
    }));
  }, []);

  const filteredPolicies = useMemo(() => {
    if (!policySearchQuery.trim()) return allPolicies;
    return allPolicies.filter(
      (p) =>
        p.policy.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(policySearchQuery.toLowerCase()),
    );
  }, [allPolicies, policySearchQuery]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!userSearchQuery.trim()) return users;
    return users.filter((user) =>
      user.user.toLowerCase().includes(userSearchQuery.toLowerCase()),
    );
  }, [users, userSearchQuery]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);

    const { active, over } = event;
    if (!over) return;

    const policyData = active.data.current as { policy: string };
    const userData = over.data.current as { userId: string; username: string };

    if (policyData && userData) {
      const user = users?.find((u) => u.id === userData.userId);
      if (!user) return;

      const hasPolicy = user.policies.some(
        (p) => p.policy === policyData.policy,
      );
      if (hasPolicy) {
        toast.info(`User already has policy: ${policyData.policy}`);
        return;
      }

      const newPolicies = [
        ...user.policies.map((p) => p.policy),
        policyData.policy,
      ];
      try {
        await updateUserPolicies(userData.userId, newPolicies);
        toast.success(
          `Added policy "${policyData.policy}" to user "${userData.username}"`,
        );
      } catch {
        // Error is handled by the hook
      }
    }
  };

  const handleAddPolicy = async (userId: string, policy: string) => {
    const user = users?.find((u) => u.id === userId);
    if (!user) return;

    const newPolicies = [...user.policies.map((p) => p.policy), policy];

    try {
      await updateUserPolicies(userId, newPolicies);
      toast.success(`Added policy "${policy}" to user "${user.user}"`);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleRemovePolicy = async (userId: string, policy: string) => {
    const user = users?.find((u) => u.id === userId);
    if (!user) return;

    const newPolicies = user.policies
      .map((p) => p.policy)
      .filter((p) => p !== policy);

    try {
      await updateUserPolicies(userId, newPolicies);
      toast.success(`Removed policy "${policy}" from user "${user.user}"`);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleCopyPassword = async (userId: string) => {
    try {
      const password = await getUserPassword(userId);
      const user = users?.find((u) => u.id === userId);

      await navigator.clipboard.writeText(password);

      toast.success(`Password for "${user?.user}" copied to clipboard`, {
        duration: 3000,
      });
    } catch (error) {
      toast.error(
        `Failed to retrieve password: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleCreateUser = (username: string, password?: string) => {
    createUser(username, password);
    if (!password) {
      toast.info("Creating user with auto-generated password...");
    }
  };

  const handleCloseCreateModal = (open: boolean) => {
    if (!open && createUserData?.generated_password) {
      resetCreateUser();
    }
    setCreateModalOpen(open);
  };

  const handleResizeStart = (clientX: number) => {
    setResizeStartX(clientX);
    setResizeStartWidth(leftPanelWidth);
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - resizeStartX;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      const newWidth = resizeStartWidth + deltaPercent;
      setLeftPanelWidth(Math.min(Math.max(newWidth, 15), 40));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing, resizeStartX, resizeStartWidth]);

  return {
    // State
    isLoading,
    isCreatingUser,
    isDeletingUser,
    createUserData,
    userSearchQuery,
    setUserSearchQuery,
    policySearchQuery,
    setPolicySearchQuery,
    createModalOpen,
    setCreateModalOpen,
    activeDragId,
    leftPanelWidth,

    // Computed values
    allPolicies,
    filteredPolicies,
    filteredUsers,

    // Handlers
    handleDragStart,
    handleDragEnd,
    handleAddPolicy,
    handleRemovePolicy,
    handleCopyPassword,
    handleDeleteUser,
    handleCreateUser,
    handleCloseCreateModal,
    handleResizeStart,
  };
}
