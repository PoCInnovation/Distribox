import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Plus, Search } from "lucide-react";
import { Policy } from "@/lib/types/policies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PolicyGate } from "@/components/policy/policy-gate";
import { cn } from "@/lib/utils";
import { UserCard } from "./user-card";
import { CreateUserModal } from "./create-user-modal";
import { DraggablePolicyBadge } from "./draggable-policy-badge";
import { PolicyChip } from "./policy-badge";
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
    filteredPolicyGroups,
    filteredUsers,
    users,
    handleDragStart,
    handleDragEnd,
    handleAddPolicy,
    handleRemovePolicy,
    handleCopyPassword,
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
          <aside
            className="hidden flex-col overflow-hidden bg-sidebar/30 md:flex"
            style={{ width: `${leftPanelWidth}%` }}
          >
            <div className="shrink-0 border-b border-border px-5 pt-6 pb-4">
              <h2 className="font-mono text-xl font-semibold">Policies</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag a policy onto a user to grant it.
              </p>
              <div className="relative mt-4">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search policies..."
                  value={policySearchQuery}
                  onChange={(e) => setPolicySearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div
              className={cn(
                "flex-1 overflow-x-hidden overflow-y-auto",
                activeDragId && "overflow-hidden",
              )}
            >
              <div className="space-y-5 px-5 py-5">
                {filteredPolicyGroups.map(({ group, policies }) => (
                  <section key={group.id}>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                      <span className={cn("size-1.5", group.tone.dot)} />
                      {group.label}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {policies.map(({ policy, description }) => (
                        <DraggablePolicyBadge
                          key={policy}
                          policy={policy}
                          description={description}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                {filteredPolicyGroups.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No policies found
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div
            className="group relative hidden w-px shrink-0 cursor-col-resize bg-border md:block"
            onMouseDown={(e) => handleResizeStart(e.clientX)}
          >
            <div className="absolute inset-y-0 -left-1 w-2 transition-colors group-hover:bg-primary/40" />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pt-6 pb-4">
              <h2 className="font-mono text-xl font-semibold">
                Users
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                  {users.length}
                </span>
              </h2>
              <div className="ml-auto flex items-center gap-2">
                <div className="relative w-64">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <PolicyGate requiredPolicies={Policy.USERS_CREATE}>
                  <Button onClick={() => setCreateModalOpen(true)}>
                    <Plus />
                    New user
                  </Button>
                </PolicyGate>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-6">
                {filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onRemovePolicy={handleRemovePolicy}
                    onAddPolicy={handleAddPolicy}
                    onCopyPassword={handleCopyPassword}
                    onDeleteUser={handleDeleteUser}
                    isDeletingUser={isDeletingUser}
                  />
                ))}
                {filteredUsers.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground">
                    No users found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragId && (
            <span className="inline-block bg-card shadow-lg shadow-black/40">
              <PolicyChip policy={activeDragId.replace("policy-", "")} />
            </span>
          )}
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
