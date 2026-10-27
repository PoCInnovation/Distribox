import { Policy, POLICY_DESCRIPTIONS } from "@/lib/types/policies";

export interface PolicyTone {
  chip: string;
  hover: string;
  text: string;
  dot: string;
}

// Full class names so Tailwind picks them up.
const TONES = {
  purple: {
    chip: "border-purple-400/45 bg-purple-400/10 text-purple-300",
    hover: "hover:bg-purple-400/20",
    text: "text-purple-300",
    dot: "bg-purple-400",
  },
  sky: {
    chip: "border-sky-400/45 bg-sky-400/10 text-sky-300",
    hover: "hover:bg-sky-400/20",
    text: "text-sky-300",
    dot: "bg-sky-400",
  },
  lime: {
    chip: "border-lime-400/45 bg-lime-400/10 text-lime-300",
    hover: "hover:bg-lime-400/20",
    text: "text-lime-300",
    dot: "bg-lime-400",
  },
  emerald: {
    chip: "border-emerald-400/45 bg-emerald-400/10 text-emerald-300",
    hover: "hover:bg-emerald-400/20",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  amber: {
    chip: "border-amber-400/45 bg-amber-400/10 text-amber-300",
    hover: "hover:bg-amber-400/20",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  rose: {
    chip: "border-rose-400/45 bg-rose-400/10 text-rose-300",
    hover: "hover:bg-rose-400/20",
    text: "text-rose-300",
    dot: "bg-rose-400",
  },
  slate: {
    chip: "border-slate-400/45 bg-slate-400/10 text-slate-300",
    hover: "hover:bg-slate-400/20",
    text: "text-slate-300",
    dot: "bg-slate-400",
  },
} satisfies Record<string, PolicyTone>;

export interface PolicyGroup {
  id: string;
  label: string;
  tone: PolicyTone;
  policies: Policy[];
}

/** Policies grouped by what they act on. Each group shares one label colour. */
export const POLICY_GROUPS: PolicyGroup[] = [
  { id: "admin", label: "Admin", tone: TONES.purple, policies: [Policy.ADMIN] },
  {
    id: "vms",
    label: "Virtual machines",
    tone: TONES.sky,
    policies: [
      Policy.VMS_GET,
      Policy.VMS_GET_BY_ID,
      Policy.VMS_CREATE,
      Policy.VMS_START,
      Policy.VMS_STOP,
      Policy.VMS_CONNECT,
      Policy.VMS_SCREENSHOT,
      Policy.VMS_DUPLICATE,
      Policy.VMS_RENAME,
      Policy.VMS_DELETE,
    ],
  },
  {
    id: "vm-access",
    label: "VM access",
    tone: TONES.sky,
    policies: [
      Policy.VMS_SSH_MANAGE,
      Policy.VMS_CREDENTIALS_LIST,
      Policy.VMS_CREDENTIALS_GET_BY_ID,
      Policy.VMS_CREDENTIALS_CREATE,
      Policy.VMS_CREDENTIALS_REVOKE,
    ],
  },
  {
    id: "vm-recovery",
    label: "VM recovery",
    tone: TONES.sky,
    policies: [
      Policy.VMS_GET_RECOVERABLE,
      Policy.VMS_RECOVER,
      Policy.VMS_CLEAN_RECOVERABLE,
      Policy.VMS_CLEAN_ALL_RECOVERABLE,
    ],
  },
  {
    id: "events",
    label: "Events",
    tone: TONES.lime,
    policies: [
      Policy.EVENTS_GET,
      Policy.EVENTS_GET_BY_ID,
      Policy.EVENTS_CREATE,
      Policy.EVENTS_UPDATE,
      Policy.EVENTS_DELETE,
    ],
  },
  {
    id: "images",
    label: "Images",
    tone: TONES.emerald,
    policies: [Policy.IMAGES_GET, Policy.IMAGES_UPLOAD],
  },
  {
    id: "nodes",
    label: "Nodes",
    tone: TONES.amber,
    policies: [
      Policy.HOST_GET,
      Policy.SLAVES_GET,
      Policy.SLAVES_GET_BY_ID,
      Policy.SLAVES_CREATE,
      Policy.SLAVES_DELETE,
    ],
  },
  {
    id: "users",
    label: "Users",
    tone: TONES.rose,
    policies: [
      Policy.USERS_GET,
      Policy.POLICIES_GET,
      Policy.USERS_CREATE,
      Policy.USERS_UPDATE_POLICIES,
      Policy.USERS_GET_PASSWORD,
      Policy.USERS_DELETE,
    ],
  },
  {
    id: "account",
    label: "Own account",
    tone: TONES.slate,
    policies: [Policy.AUTH_ME_GET, Policy.AUTH_CHANGE_PASSWORD],
  },
];

const ORDER = new Map<string, { group: PolicyGroup; index: number }>();
let position = 0;
for (const group of POLICY_GROUPS) {
  for (const policy of group.policies) {
    ORDER.set(policy, { group, index: position++ });
  }
}

export function policyTone(policy: string): PolicyTone {
  return ORDER.get(policy)?.group.tone ?? TONES.slate;
}

export function policyDescription(policy: string): string {
  return POLICY_DESCRIPTIONS[policy as Policy] ?? "";
}

/** Sorts policies into palette order; unknown ones go last, alphabetically. */
export function sortPolicies<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const pa = ORDER.get(key(a))?.index ?? Number.MAX_SAFE_INTEGER;
    const pb = ORDER.get(key(b))?.index ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || key(a).localeCompare(key(b));
  });
}
