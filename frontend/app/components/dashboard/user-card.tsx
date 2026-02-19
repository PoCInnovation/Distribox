import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, KeyIcon, ChevronDown, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Policy, type User } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PolicyGate } from "../policy/policy-gate";
import { Button } from "@/components/ui/button";
import { PolicyBadge } from "./policy-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserCardProps {
  user: User;
  onRemovePolicy: (userId: string, policy: string) => void;
  onAddPolicy: (userId: string, policy: string) => void;
  onShowPassword: (userId: string) => void;
  onDeleteUser: (userId: string) => Promise<void>;
  isDeletingUser: boolean;
  availablePolicies: { policy: string; description: string }[];
}

export function UserCard({
  user,
  onRemovePolicy,
  onAddPolicy,
  onShowPassword,
  onDeleteUser,
  isDeletingUser,
  availablePolicies,
}: UserCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `user-${user.id}`,
    data: { userId: user.id, username: user.user },
  });

  const unassignedPolicies = availablePolicies.filter(
    (p) => !user.policies.some((up) => up.policy === p.policy),
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
                <DropdownMenuContent
                  align="end"
                  className="w-56 max-h-64 overflow-y-auto"
                >
                  {unassignedPolicies.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                      All policies assigned
                    </div>
                  ) : (
                    unassignedPolicies.map(({ policy, description }) => (
                      <DropdownMenuItem
                        key={policy}
                        onClick={() => onAddPolicy(user.id, policy)}
                        className="flex flex-col items-start gap-1 cursor-pointer focus:bg-secondary focus:text-white"
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
              <Button size="sm" onClick={() => onShowPassword(user.id)}>
                <KeyIcon className="h-4 w-4" />
              </Button>
            </PolicyGate>
            <PolicyGate requiredPolicies={Policy.USERS_DELETE}>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isDeletingUser}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </PolicyGate>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Policies:</p>
          {user.policies.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No policies assigned
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.policies.map((policyObj) => (
                <PolicyBadge
                  key={policyObj.policy}
                  description={policyObj.description}
                  policy={policyObj.policy}
                  removable
                  onRemove={() => onRemovePolicy(user.id, policyObj.policy)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-mono font-medium">{user.user}</span>? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeletingUser}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingUser}
              onClick={async () => {
                await onDeleteUser(user.id);
                setDeleteDialogOpen(false);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
