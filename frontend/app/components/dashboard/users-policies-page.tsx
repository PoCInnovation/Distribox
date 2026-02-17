import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Users as UsersIcon, Plus, Search, Copy, Eye, EyeOff, ChevronDown, InfoIcon } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { Policy, POLICY_DESCRIPTIONS } from "@/lib/types/policies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { PolicyGate } from "@/components/policy/policy-gate";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

// Policy color mapping with vibrant colors and transparent backgrounds
const POLICY_COLORS = {
  [Policy.ADMIN]: {
    bg: "bg-purple-500/20",
    border: "border-purple-500",
    hover: "hover:bg-purple-500/30",
    text: "text-purple-600 dark:text-purple-400",
  },
  [Policy.AUTH_ME_GET]: {
    bg: "bg-cyan-500/20",
    border: "border-cyan-500",
    hover: "hover:bg-cyan-500/30",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  [Policy.AUTH_CHANGE_PASSWORD]: {
    bg: "bg-amber-500/20",
    border: "border-amber-500",
    hover: "hover:bg-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  [Policy.HOST_GET]: {
    bg: "bg-slate-500/20",
    border: "border-slate-500",
    hover: "hover:bg-slate-500/30",
    text: "text-slate-600 dark:text-slate-400",
  },
  [Policy.IMAGES_GET]: {
    bg: "bg-sky-500/20",
    border: "border-sky-500",
    hover: "hover:bg-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
  },
  [Policy.POLICIES_GET]: {
    bg: "bg-violet-500/20",
    border: "border-violet-500",
    hover: "hover:bg-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
  },
  [Policy.USERS_GET]: {
    bg: "bg-blue-500/20",
    border: "border-blue-500",
    hover: "hover:bg-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
  },
  [Policy.USERS_CREATE]: {
    bg: "bg-emerald-500/20",
    border: "border-emerald-500",
    hover: "hover:bg-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  [Policy.USERS_UPDATE_POLICIES]: {
    bg: "bg-yellow-500/20",
    border: "border-yellow-500",
    hover: "hover:bg-yellow-500/30",
    text: "text-yellow-600 dark:text-yellow-500",
  },
  [Policy.USERS_GET_PASSWORD]: {
    bg: "bg-rose-500/20",
    border: "border-rose-500",
    hover: "hover:bg-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
  [Policy.VMS_GET]: {
    bg: "bg-indigo-500/20",
    border: "border-indigo-500",
    hover: "hover:bg-indigo-500/30",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  [Policy.VMS_GET_BY_ID]: {
    bg: "bg-blue-600/20",
    border: "border-blue-600",
    hover: "hover:bg-blue-600/30",
    text: "text-blue-700 dark:text-blue-400",
  },
  [Policy.VMS_CREATE]: {
    bg: "bg-teal-500/20",
    border: "border-teal-500",
    hover: "hover:bg-teal-500/30",
    text: "text-teal-600 dark:text-teal-400",
  },
  [Policy.VMS_START]: {
    bg: "bg-lime-500/20",
    border: "border-lime-500",
    hover: "hover:bg-lime-500/30",
    text: "text-lime-600 dark:text-lime-400",
  },
  [Policy.VMS_STOP]: {
    bg: "bg-orange-500/20",
    border: "border-orange-500",
    hover: "hover:bg-orange-500/30",
    text: "text-orange-600 dark:text-orange-400",
  },
  [Policy.VMS_UPDATE_PASSWORD]: {
    bg: "bg-pink-500/20",
    border: "border-pink-500",
    hover: "hover:bg-pink-500/30",
    text: "text-pink-600 dark:text-pink-400",
  },
  [Policy.VMS_DELETE]: {
    bg: "bg-red-500/20",
    border: "border-red-500",
    hover: "hover:bg-red-500/30",
    text: "text-red-600 dark:text-red-400",
  },
  [Policy.VMS_DELETE_PASSWORD]: {
    bg: "bg-fuchsia-500/20",
    border: "border-fuchsia-500",
    hover: "hover:bg-fuchsia-500/30",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  default: {
    bg: "bg-gray-500/20",
    border: "border-gray-500",
    hover: "hover:bg-gray-500/30",
    text: "text-gray-600 dark:text-gray-400",
  },
};

function getPolicyColor(policy: string) {
  return POLICY_COLORS[policy as Policy] || POLICY_COLORS.default;
}

interface DraggablePolicyBadgeProps {
  policy: string;
  description: string;
}

function DraggablePolicyBadge({ policy, description }: DraggablePolicyBadgeProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `policy-${policy}`,
    data: { policy, description },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const colors = getPolicyColor(policy);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="group relative cursor-grab active:cursor-grabbing"
    >
      <div
        className={cn(
          "w-full px-4 py-2.5 text-sm font-medium transition-all duration-200",
          "border-2 rounded-sm shadow-sm",
          "cursor-grab active:cursor-grabbing",
          colors.bg,
          colors.border,
          colors.hover,
          colors.text,
        )}
      >
        {policy}
      </div>
      <div className="absolute left-full ml-2 top-0 w-64 p-3 bg-popover text-popover-foreground border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
        <p className="text-xs">{description}</p>
      </div>
    </div>
  );
}

interface PolicyBadgeProps {
  policy: string;
  onRemove?: () => void;
  removable?: boolean;
}

function PolicyBadge({ policy, onRemove, removable = false }: PolicyBadgeProps) {
  const colors = getPolicyColor(policy);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-2 rounded-sm shadow-sm transition-all",
        colors.bg,
        colors.border,
        colors.hover,
        colors.text,
      )}
    >
      <span>{policy}</span>
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:opacity-70 transition-opacity font-bold text-base leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}

interface UserCardProps {
  user: User;
  onRemovePolicy: (userId: string, policy: string) => void;
  onAddPolicy: (userId: string, policy: string) => void;
  onShowPassword: (userId: string) => void;
  availablePolicies: { policy: string; description: string }[];
}

function UserCard({ user, onRemovePolicy, onAddPolicy, onShowPassword, availablePolicies }: UserCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `user-${user.id}`,
    data: { userId: user.id, username: user.user },
  });

  const unassignedPolicies = availablePolicies.filter(
    (p) => !user.policies.some((up) => up.policy === p.policy)
  );

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200 hover:shadow-md w-full",
        isOver && "ring-2 ring-primary bg-primary/5",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold">{user.user}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Created {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PolicyGate requiredPolicies={Policy.USERS_UPDATE_POLICIES}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Policy
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-64 overflow-y-auto">
                  {unassignedPolicies.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                      All policies assigned
                    </div>
                  ) : (
                    unassignedPolicies.map(({ policy, description }) => (
                      <DropdownMenuItem
                        key={policy}
                        onClick={() => onAddPolicy(user.id, policy)}
                        className="flex flex-col items-start gap-1 cursor-pointer"
                      >
                        <span className="text-xs font-medium">{policy}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-2">
                          {description}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </PolicyGate>
            <PolicyGate requiredPolicies={Policy.USERS_GET_PASSWORD}>
              <Button
                size="sm"
                onClick={() => onShowPassword(user.id)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </PolicyGate>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Policies:</p>
          {user.policies.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No policies assigned</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.policies.map((policyObj) => (
                <PolicyBadge
                  key={policyObj.policy}
                  policy={policyObj.policy}
                  removable
                  onRemove={() => onRemovePolicy(user.id, policyObj.policy)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (username: string, password?: string) => void;
  isCreating: boolean;
  generatedPassword?: string;
}

function CreateUserModal({
  open,
  onOpenChange,
  onCreate,
  isCreating,
  generatedPassword,
}: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onCreate(username.trim(), password.trim() || undefined);
    }
  };

  const handleClose = () => {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    onOpenChange(false);
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success("Password copied to clipboard!");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            {generatedPassword
              ? "User created successfully! Save the password below."
              : "Create a new user account. Leave password empty to generate one automatically."}
          </DialogDescription>
        </DialogHeader>
        {generatedPassword ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-md">
              <Label className="text-sm font-medium mb-2 block">
                Generated Password
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-background p-2 rounded border">
                  {generatedPassword}
                </code>
                <Button size="sm" variant="outline" onClick={copyPassword}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Make sure to save this password. You won't be able to see it again.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password (optional)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPoliciesPage() {
  const {
    users,
    isLoading,
    createUser,
    updateUserPolicies,
    getUserPassword,
    isCreatingUser,
    createUserData,
    resetCreateUser,
  } = useUsers();

  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [policySearchQuery, setPolicySearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(25); // percentage
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
    return allPolicies.filter((p) =>
      p.policy.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(policySearchQuery.toLowerCase())
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

      const hasPolicy = user.policies.some((p) => p.policy === policyData.policy);
      if (hasPolicy) {
        toast.info(`User already has policy: ${policyData.policy}`);
        return;
      }

      const newPolicies = [...user.policies.map((p) => p.policy), policyData.policy];
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

  const handleShowPassword = async (userId: string) => {
    try {
      const password = await getUserPassword(userId);
      const user = users?.find((u) => u.id === userId);
      toast.success(
        <div>
          <p className="font-medium">Password for {user?.user}:</p>
          <code className="text-xs">{password}</code>
        </div>,
        { duration: 10000 },
      );
    } catch (error) {
      toast.error(`Failed to retrieve password: ${error instanceof Error ? error.message : "Unknown error"}`);
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

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - resizeStartX;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      const newWidth = resizeStartWidth + deltaPercent;
      setLeftPanelWidth(Math.min(Math.max(newWidth, 15), 40)); // Min 15%, Max 40%
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
                  <span className="text-accent font-bold">Drag and Drop</span> policies to user cards
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
            <div className={cn(
              "flex-1 overflow-y-auto overflow-x-hidden",
              activeDragId && "overflow-hidden"
            )}>
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
            onMouseDown={(e) => {
              setResizeStartX(e.clientX);
              setResizeStartWidth(leftPanelWidth);
              setIsResizing(true);
            }}
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
          {activeDragId && (() => {
            const policyName = activeDragId.replace("policy-", "");
            const colors = getPolicyColor(policyName);
            return (
              <div className={cn(
                "px-4 py-2.5 text-sm font-medium border-2 rounded-sm shadow-lg opacity-90",
                colors.bg,
                colors.border,
                colors.text,
              )}>
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
