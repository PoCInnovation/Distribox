import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Policy, type User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Group {
  key: string;
  label: string;
  /** Verb shown in the summary line, derived from the policy suffix. */
  verbs: string[];
  policies: { policy: string; description: string }[];
}

const GROUP_LABELS: Record<string, string> = {
  vms: "Virtual machines",
  events: "Events",
  users: "Users",
  slaves: "Slaves",
  images: "Images",
  host: "Host",
  auth: "Own account",
  policies: "Policies",
  distribox: "Distribox",
};

const GROUP_ORDER = [
  "vms",
  "events",
  "slaves",
  "users",
  "images",
  "host",
  "policies",
  "auth",
  "distribox",
];

/** "vms:credentials:create" → "credentials create"; "vms:getById" → "get by id". */
function verbOf(policy: string): string {
  const [, ...rest] = policy.split(":");
  return rest
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

export function groupPolicies(user: User): Group[] {
  const byGroup = new Map<string, Group>();
  for (const entry of user.policies) {
    const key = entry.policy.split(":")[0] ?? "other";
    let group = byGroup.get(key);
    if (!group) {
      group = {
        key,
        label: GROUP_LABELS[key] ?? key,
        verbs: [],
        policies: [],
      };
      byGroup.set(key, group);
    }
    group.policies.push(entry);
    group.verbs.push(verbOf(entry.policy));
  }
  return [...byGroup.values()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a.key);
    const ib = GROUP_ORDER.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * Compact, grouped view of what the signed-in user may do.
 * Admins get one line; everyone else gets one row per area with the verbs
 * they hold. The raw policy names stay one click away for support questions.
 */
export function PermissionsSummary({ user }: { user: User }) {
  const admin = user.policies.some((p) => p.policy === Policy.ADMIN);
  const groups = groupPolicies(user).filter((g) => g.key !== "distribox");
  const [showRaw, setShowRaw] = useState(false);
  const total = user.policies.length;

  if (total === 0) {
    return (
      <div className="px-5 py-4 text-sm text-muted-foreground">
        No permissions are assigned to this account. Ask an administrator for
        the ones you need.
      </div>
    );
  }

  return (
    <div>
      {admin ? (
        <div className="flex items-start gap-3 px-5 py-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="text-sm">
            <p className="font-medium">Administrator: full access</p>
            <p className="mt-0.5 text-muted-foreground">
              <span className="font-mono text-xs">distribox:admin</span> grants
              every permission, including ones added in future versions.
              {groups.length > 0 &&
                ` ${total - 1} individual policies are also listed on the account; they change nothing while admin is held.`}
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {groups.map((g) => (
            <li
              key={g.key}
              className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-baseline gap-4 px-5 py-2.5 text-sm"
            >
              <span>{g.label}</span>
              <span className="text-muted-foreground">
                {g.verbs.join(", ")}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {g.policies.length}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border/70">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="flex w-full items-center gap-2 px-5 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              showRaw && "rotate-180",
            )}
          />
          {showRaw ? "Hide" : "Show"} the {total} policy name
          {total > 1 ? "s" : ""}
        </button>
        {showRaw && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-4 pt-1">
            {user.policies.map((p) => (
              <li
                key={p.policy}
                title={p.description}
                className={cn(
                  "font-mono text-xs",
                  p.policy === Policy.ADMIN
                    ? "text-accent"
                    : "text-foreground/80",
                )}
              >
                {p.policy}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
