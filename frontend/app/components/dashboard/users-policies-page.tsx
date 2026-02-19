import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Users as UsersIcon, Plus, Search, InfoIcon } from "lucide-react";
import { Policy } from "@/lib/types/policies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PolicyGate } from "@/components/policy/policy-gate";
import { cn } from "@/lib/utils";
import { getPolicyColor } from "@/lib/get-policy-color";
import { UserCard } from "./user-card";
import { CreateUserModal } from "./create-user-modal";
import { DraggablePolicyBadge } from "./draggable-policy-badge";
import { useUsersPoliciesPage } from "@/hooks/use-users-policies-page";

export default function UsersPoliciesPage() {
  const {
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
    allPolicies,
    filteredPolicies,
    filteredUsers,
    handleDragStart,
    handleDragEnd,
    handleAddPolicy,
    handleRemovePolicy,
    handleShowPassword,
    handleDeleteUser,
    handleCreateUser,
    handleCloseCreateModal,
    handleResizeStart,
  } = useUsersPoliciesPage();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  return (
    <PolicyGate requiredPolicies={Policy.USERS_GET}>
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex h-full overflow-hidden">
          {/* Left Panel - Policies */}
          <div
            className="border-r border-border bg-sidebar/30 flex flex-col overflow-hidden"
            style={{ width: `${leftPanelWidth}%` }}
          >
            <div className="p-6 border-b border-border flex-shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <UsersIcon className="h-5 w-5" />
                Available Policies
              </h2>
              <p className="flex flex-row space-x-2 text-xs text-muted-foreground mt-1 mb-4">
                <InfoIcon className="text-accent h-4 w-4" />
                <span>
                  <span className="text-accent font-bold">Drag and Drop</span>{" "}
                  policies to user cards
                </span>
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search policies..."
                  value={policySearchQuery}
                  onChange={(e) => setPolicySearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div
              className={cn(
                "flex-1 overflow-y-auto overflow-x-hidden",
                activeDragId && "overflow-hidden",
              )}
            >
              <div className="p-4 space-y-2">
                {filteredPolicies.map(({ policy, description }) => (
                  <DraggablePolicyBadge
                    key={policy}
                    policy={policy}
                    description={description}
                  />
                ))}
                {filteredPolicies.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No policies found
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resizer */}
          <div
            className="w-2 bg-border hover:bg-primary cursor-col-resize transition-colors flex-shrink-0 relative group"
            onMouseDown={(e) => handleResizeStart(e.clientX)}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-transparent group-hover:bg-primary/50 transition-colors" />
          </div>

          {/* Right Panel - Users */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Users</h2>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-4 pb-24">
                {filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onRemovePolicy={handleRemovePolicy}
                    onAddPolicy={handleAddPolicy}
                    onShowPassword={handleShowPassword}
                    onDeleteUser={handleDeleteUser}
                    isDeletingUser={isDeletingUser}
                    availablePolicies={allPolicies}
                  />
                ))}
                {filteredUsers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No users found
                  </div>
                )}
              </div>
            </ScrollArea>

            <PolicyGate requiredPolicies={Policy.USERS_CREATE}>
              <div className="fixed bottom-6 right-6">
                <Button
                  size="lg"
                  className="rounded-full shadow-lg gap-2 px-6"
                  onClick={() => setCreateModalOpen(true)}
                >
                  <Plus className="h-5 w-5" />
                  <span className="font-medium">Create New User</span>
                </Button>
              </div>
            </PolicyGate>
          </div>
        </div>

        <DragOverlay>
          {activeDragId &&
            (() => {
              const policyName = activeDragId.replace("policy-", "");
              const colors = getPolicyColor(policyName);
              return (
                <div
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-2 rounded-sm shadow-lg opacity-90",
                    colors.bg,
                    colors.border,
                    colors.text,
                  )}
                >
                  {policyName}
                </div>
              );
            })()}
        </DragOverlay>

        <CreateUserModal
          open={createModalOpen}
          onOpenChange={handleCloseCreateModal}
          onCreate={handleCreateUser}
          isCreating={isCreatingUser}
          generatedPassword={createUserData?.generated_password}
        />
      </DndContext>
    </PolicyGate>
  );
}
