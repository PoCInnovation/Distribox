import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { LucideIcon } from "lucide-react";
import {
  Calendar1Icon,
  LayoutIcon,
  Monitor,
  PlusIcon,
  Search,
  ServerIcon,
  Settings,
  Users,
} from "lucide-react";
import { KbdGroup } from "@/components/ui/kbd";
import { useAuthz } from "@/contexts/authz-context";
import { getVMs, getImages } from "@/lib/api";
import { Policy, type VirtualMachineMetadata } from "@/lib/types";
import { resolveOsInfo } from "@/lib/vm-os";
import { getStateUi, type StateTone } from "@/lib/vm-state-ui";
import { cn } from "@/lib/utils";

export interface PaletteItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Extra words the search should match. */
  keywords?: string;
  disabled?: boolean;
  /** Why the item is disabled, shown next to the label. */
  reason?: string;
  destructive?: boolean;
  run: () => void;
}

export interface PaletteSection {
  title: string;
  items: PaletteItem[];
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  setSection: (key: string, section: PaletteSection | null) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider",
    );
  }
  return ctx;
}

/**
 * Lets a page add its own commands (e.g. actions on the open VM) to the top of
 * the palette while it is mounted.
 */
export function usePaletteSection(key: string, section: PaletteSection | null) {
  const { setSection } = useCommandPalette();
  useEffect(() => {
    setSection(key, section);
  }, [key, section, setSection]);
  useEffect(() => () => setSection(key, null), [key, setSection]);
}

/** Ctrl/⌘ K anywhere in the dashboard. */
export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Map<string, PaletteSection>>(
    () => new Map(),
  );

  const setSection = useCallback(
    (key: string, section: PaletteSection | null) => {
      setSections((prev) => {
        if (!section && !prev.has(key)) return prev;
        const next = new Map(prev);
        if (section) next.set(key, section);
        else next.delete(key);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, setSection }),
    [open, setSection],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog
        open={open}
        onOpenChange={setOpen}
        sections={sections}
      />
    </CommandPaletteContext.Provider>
  );
}

const PAGES: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  policies: Policy[];
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutIcon, policies: [] },
  {
    href: "/dashboard/monitor",
    label: "Monitor",
    icon: Monitor,
    policies: [Policy.VMS_SCREENSHOT],
  },
  {
    href: "/dashboard/provision",
    label: "Provision VM",
    icon: PlusIcon,
    policies: [Policy.VMS_CREATE],
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: Calendar1Icon,
    policies: [Policy.EVENTS_GET],
  },
  {
    href: "/dashboard/slaves",
    label: "Nodes",
    icon: ServerIcon,
    policies: [Policy.SLAVES_GET],
  },
  {
    href: "/dashboard/users-policies",
    label: "Users & Policies",
    icon: Users,
    policies: [Policy.USERS_GET],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    policies: [],
  },
];

const DOT_TONE: Record<StateTone, string> = {
  success: "bg-success",
  muted: "bg-muted-foreground/60",
  warning: "bg-warning",
  destructive: "bg-destructive",
  accent: "bg-accent",
};

interface Row {
  key: string;
  section: string;
  keywords: string;
  disabled?: boolean;
  run: () => void;
  render: () => React.ReactNode;
}

function CommandPaletteDialog({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: Map<string, PaletteSection>;
}) {
  const navigate = useNavigate();
  const authz = useAuthz();
  const canListVms = authz.hasPolicy(Policy.VMS_GET);
  const canListImages = authz.hasPolicy(Policy.IMAGES_GET);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const vmsQuery = useQuery<VirtualMachineMetadata[]>({
    queryKey: ["vms"],
    queryFn: getVMs,
    enabled: open && canListVms,
    retry: false,
  });
  const imagesQuery = useQuery({
    queryKey: ["images"],
    queryFn: getImages,
    enabled: open && canListImages,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];

    for (const [key, section] of sections) {
      for (const item of section.items) {
        const Icon = item.icon;
        list.push({
          key: `${key}:${item.id}`,
          section: section.title,
          keywords: `${item.label} ${item.keywords ?? ""}`,
          disabled: item.disabled,
          run: item.run,
          render: () => (
            <>
              {Icon && (
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    item.destructive
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                />
              )}
              <span
                className={cn(
                  "flex-1 truncate",
                  item.destructive && "text-destructive",
                )}
              >
                {item.label}
                {item.disabled && item.reason && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {item.reason}
                  </span>
                )}
              </span>
            </>
          ),
        });
      }
    }

    for (const vm of [...(vmsQuery.data ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const os = resolveOsInfo(vm.os, imagesQuery.data);
      const state = getStateUi(vm.state);
      const host = vm.slave_name || "master";
      list.push({
        key: `vm:${vm.id}`,
        section: "Jump to VM",
        keywords: `${vm.name} ${os.label} ${vm.os} ${host} ${vm.ipv4 ?? ""} ${vm.id} ${state.label}`,
        run: () => navigate(`/dashboard?vm=${encodeURIComponent(vm.id)}`),
        render: () => (
          <>
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              <span
                className={cn("size-2 rounded-full", DOT_TONE[state.tone])}
              />
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
              {vm.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {os.label}
            </span>
            <span className="w-16 truncate text-right text-xs text-muted-foreground">
              {host}
            </span>
          </>
        ),
      });
    }

    for (const page of PAGES) {
      if (authz.missingPolicies(page.policies).length > 0) continue;
      const Icon = page.icon;
      list.push({
        key: `page:${page.href}`,
        section: "Go to",
        keywords: `${page.label} ${page.href}`,
        run: () => navigate(page.href),
        render: () => (
          <>
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{page.label}</span>
          </>
        ),
      });
    }

    return list;
  }, [authz, imagesQuery.data, navigate, sections, vmsQuery.data]);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return rows;
    return rows.filter((row) => {
      const hay = row.keywords.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, filtered]);

  const runRow = (row: Row | undefined) => {
    if (!row || row.disabled) return;
    onOpenChange(false);
    // Let the dialog close and return focus before the command moves it again.
    requestAnimationFrame(() => row.run());
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ row: Row; index: number }>>();
    filtered.forEach((row, index) => {
      const entries = map.get(row.section) ?? [];
      entries.push({ row, index });
      map.set(row.section, entries);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-label="Command palette"
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 fixed top-[14vh] left-1/2 z-50 w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 border border-border bg-popover text-popover-foreground shadow-2xl outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              runRow(filtered[active]);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Run an action, jump to a virtual machine or open a page.
          </DialogPrimitive.Description>
          <div className="flex h-12 items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Run an action, jump to a VM or open a page"
              aria-label="Search commands"
              role="combobox"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={
                filtered[active] ? `palette-${filtered[active].key}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <KbdGroup keys={["Esc"]} />
          </div>
          <div
            ref={listRef}
            id="command-palette-list"
            role="listbox"
            className="max-h-[52vh] overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing matches “{query}”
              </p>
            ) : (
              grouped.map(([section, entries]) => (
                <div key={section} role="group" aria-label={section}>
                  <div className="px-3 pt-2 pb-1 font-mono text-[11px] text-muted-foreground">
                    {section}
                  </div>
                  {entries.map(({ row, index }) => (
                    <div
                      key={row.key}
                      id={`palette-${row.key}`}
                      role="option"
                      aria-selected={index === active}
                      aria-disabled={row.disabled}
                      data-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => runRow(row)}
                      className={cn(
                        "mx-1 flex h-9 cursor-default items-center gap-2 px-2 text-sm",
                        index === active && "bg-primary/15",
                        row.disabled && "opacity-50",
                      )}
                    >
                      {row.render()}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="flex h-8 items-center gap-3 border-t border-border px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <KbdGroup keys={["↑", "↓"]} /> move
            </span>
            <span className="flex items-center gap-1">
              <KbdGroup keys={["↵"]} /> run
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
