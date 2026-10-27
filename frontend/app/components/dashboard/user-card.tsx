import { Fragment, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, KeyRound, ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Policy, type User } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PolicyGate } from "../policy/policy-gate";
import { Button } from "@/components/ui/button";
import { PolicyBadge } from "./policy-badge";
import { useTimezone, formatDateOnly } from "@/hooks/useTimezone";
import { useAuthz } from "@/contexts/authz-context";
import {
  POLICY_GROUPS,
  policyDescription,
  sortPolicies,
} from "@/lib/policy-groups";

interface UserCardProps {
  user: User;
  onRemovePolicy: (userId: string, policy: string) => void;
  onAddPolicy: (userId: string, policy: string) => void;
  onCopyPassword: (userId: string) => void;
  onDeleteUser: (userId: string) => Promise<void>;
  isDeletingUser: boolean;
}

export function UserCard({
  user,
  onRemovePolicy,
  onAddPolicy,
  onCopyPassword,
  onDeleteUser,
  isDeletingUser,
}: UserCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const timeZone = useTimezone();
  const canEdit = useAuthz().hasPolicy(Policy.USERS_UPDATE_POLICIES);

  const { setNodeRef, isOver } = useDroppable({
    id: `user-${user.id}`,
    data: { userId: user.id, username: user.user },
  });

  const assigned = new Set(user.policies.map((p) => p.policy));
  const addable = POLICY_GROUPS.map((group) => ({
    group,
    policies: group.policies.filter((p) => !assigned.has(p)),
  })).filter((g) => g.policies.length > 0);
  const policies = sortPolicies(user.policies, (p) => p.policy);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border border-border bg-card p-4 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-base font-semibold">
            {user.user}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {formatDateOnly(user.created_at, timeZone)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <PolicyGate requiredPolicies={Policy.USERS_UPDATE_POLICIES}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus />
                  Add policy
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-80 w-64 overflow-y-auto"
              >
                {addable.length === 0 ? (
                  <div className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                    All policies assigned
                  </div>
                ) : (
                  addable.map(({ group, policies }) => (
                    <Fragment key={group.id}>
                      <DropdownMenuLabel className="flex items-center gap-2 pt-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                        <span className={cn("size-1.5", group.tone.dot)} />
                        {group.label}
                      </DropdownMenuLabel>
                      {policies.map((policy) => (
                        <DropdownMenuItem
                          key={policy}
                          onSelect={() => onAddPolicy(user.id, policy)}
                          className="flex cursor-pointer flex-col items-start gap-0.5"
                        >
                          <span
                            className={cn("font-mono text-xs", group.tone.text)}
                          >
                            {policy}
                          </span>
                          <span className="line-clamp-2 text-[11px] text-muted-foreground">
                            {policyDescription(policy)}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </Fragment>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </PolicyGate>
          <PolicyGate requiredPolicies={Policy.USERS_GET_PASSWORD}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Copy ${user.user}'s password`}
                  onClick={() => onCopyPassword(user.id)}
                >
                  <KeyRound />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy password</TooltipContent>
            </Tooltip>
          </PolicyGate>
          <PolicyGate requiredPolicies={Policy.USERS_DELETE}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Delete ${user.user}`}
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isDeletingUser}
                  className="text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete user</TooltipContent>
            </Tooltip>
          </PolicyGate>
        </div>
      </div>

      {policies.length === 0 ? (
        <p
          className={cn(
            "mt-3 border border-dashed border-border px-3 py-2 text-xs text-muted-foreground",
            isOver && "border-primary/60",
          )}
        >
          No policies
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {policies.map((p) => (
            <PolicyBadge
              key={p.policy}
              policy={p.policy}
              description={p.description}
              onRemove={
                canEdit ? () => onRemovePolicy(user.id, p.policy) : undefined
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete user"
        description={
          <p>
            Delete <span className="font-mono text-foreground">{user.user}</span>?
            This can't be undone.
          </p>
        }
        confirmLabel="Delete user"
        destructive
        pending={isDeletingUser}
        onConfirm={async () => {
          await onDeleteUser(user.id);
          setDeleteDialogOpen(false);
        }}
      />
    </div>
  );
}
