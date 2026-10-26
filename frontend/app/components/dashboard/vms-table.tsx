import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  KeyRound,
  Loader2,
  Play,
  Plus,
  Search,
  SearchX,
  Server,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Policy, VMState, type VirtualMachineMetadata } from "@/lib/types";
import {
  getStateUi,
  getStatusBucket,
  type StatusBucket,
} from "@/lib/vm-state-ui";
import { parseOsImage } from "@/lib/vm-os";
import { useAuthz } from "@/contexts/authz-context";
import {
  formatMissingPolicies,
  policiesFor,
  stateAllows,
  useVmActions,
  type VmActionId,
} from "@/hooks/useVmActions";
import { VmStatus } from "./vm-status";
import { VmOsLabel } from "./vm-os-label";
import { CopyText } from "./copy-text";
import { VmActionMenu } from "./vm-action-menu";
import { KbdGroup, useModKey } from "@/components/ui/kbd";
import { useCommandPalette } from "@/components/command-palette";

export const MASTER_HOST_LABEL = "Master";

export function hostLabel(vm: VirtualMachineMetadata): string {
  return vm.slave_name || MASTER_HOST_LABEL;
}

type SortKey =
  | "name"
  | "state"
  | "os"
  | "resources"
  | "ipv4"
  | "host"
  | "credentials";

type SortDir = "asc" | "desc";

const STATE_ORDER: VMState[] = [
  VMState.RUNNING,
  VMState.SHUTDOWN,
  VMState.PAUSED,
  VMState.PMSUSPENDED,
  VMState.BLOCKED,
  VMState.CRASHED,
  VMState.NOSTATE,
  VMState.UNKNOWN,
  VMState.STOPPED,
];

function ipToNumber(ip: string | null): number {
  if (!ip) return Number.MAX_SAFE_INTEGER;
  return ip
    .split(".")
    .reduce((acc, part) => acc * 256 + (Number.parseInt(part, 10) || 0), 0);
}

function compare(a: VirtualMachineMetadata, b: VirtualMachineMetadata, key: SortKey) {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    case "state":
      return STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
    case "os":
      return parseOsImage(a.os).label.localeCompare(parseOsImage(b.os).label);
    case "resources":
      return a.vcpus - b.vcpus || a.mem - b.mem || a.disk_size - b.disk_size;
    case "ipv4":
      return ipToNumber(a.ipv4) - ipToNumber(b.ipv4);
    case "host":
      return hostLabel(a).localeCompare(hostLabel(b));
    case "credentials":
      return a.credentials_count - b.credentials_count;
  }
}

interface DashboardVMsTableProps {
  vms: VirtualMachineMetadata[];
  /** VM currently open in the drawer; its row is highlighted. */
  openVmId: string | null;
  onOpen: (vm: VirtualMachineMetadata) => void;
  onBulk: (action: "start" | "stop" | "delete", vms: VirtualMachineMetadata[]) => void;
}

export function DashboardVMsTable({
  vms,
  openVmId,
  onOpen,
  onBulk,
}: DashboardVMsTableProps) {
  const authz = useAuthz();
  const palette = useCommandPalette();
  const modKey = useModKey();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | StatusBucket>("all");
  const [host, setHost] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const hosts = useMemo(() => {
    const set = new Set<string>();
    for (const vm of vms) set.add(hostLabel(vm));
    return [...set].sort((a, b) =>
      a === MASTER_HOST_LABEL ? -1 : b === MASTER_HOST_LABEL ? 1 : a.localeCompare(b),
    );
  }, [vms]);

  const counts = useMemo(() => {
    const c = { all: vms.length, running: 0, stopped: 0, other: 0 };
    for (const vm of vms) c[getStatusBucket(vm.state)] += 1;
    return c;
  }, [vms]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = vms.filter((vm) => {
      if (status !== "all" && getStatusBucket(vm.state) !== status) return false;
      if (host !== "all" && hostLabel(vm) !== host) return false;
      if (!q) return true;
      const os = parseOsImage(vm.os);
      return (
        vm.name.toLowerCase().includes(q) ||
        (vm.ipv4 ?? "").includes(q) ||
        os.label.toLowerCase().includes(q) ||
        vm.os.toLowerCase().includes(q) ||
        vm.id.toLowerCase().startsWith(q) ||
        hostLabel(vm).toLowerCase().includes(q) ||
        getStateUi(vm.state).label.toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort(
      (a, b) => dir * compare(a, b, sortKey) || a.name.localeCompare(b.name),
    );
  }, [vms, query, status, host, sortKey, sortDir]);

  const filteredIds = useMemo(() => new Set(filtered.map((v) => v.id)), [filtered]);
  const selectedVms = useMemo(
    () => vms.filter((v) => selected.has(v.id)),
    [vms, selected],
  );
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((v) => selected.has(v.id));
  const someVisibleSelected = filtered.some((v) => selected.has(v.id));

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setHost("all");
  };

  const hasFilters = query !== "" || status !== "all" || host !== "all";
  const canCreate = authz.hasPolicy(Policy.VMS_CREATE);

  return (
    <section
      aria-label="Virtual machines"
      className="border border-border bg-card"
    >
      {/* Toolbar, swapped for the bulk bar while rows are selected */}
      {selectedVms.length > 0 ? (
        <BulkBar
          selected={selectedVms}
          onClear={() => setSelected(new Set())}
          onBulk={(action, list) => {
            onBulk(action, list);
            if (action !== "delete") setSelected(new Set());
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, IP or OS"
              aria-label="Search virtual machines"
              className="h-8 bg-background pl-9 pr-8 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div
            role="radiogroup"
            aria-label="Filter by status"
            className="flex h-8 items-stretch border border-border text-sm"
          >
            {(
              [
                ["all", "All"],
                ["running", "Running"],
                ["stopped", "Stopped"],
                ["other", "Other"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={status === value}
                onClick={() => setStatus(value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 transition-colors not-first:border-l not-first:border-border",
                  status === value
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {label}
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    status === value ? "text-primary" : "text-muted-foreground/70",
                  )}
                >
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>

          {hosts.length > 1 && (
            <Select value={host} onValueChange={setHost}>
              <SelectTrigger
                size="sm"
                aria-label="Filter by host"
                className="h-8 min-w-36 bg-background"
              >
                <Server className="size-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hosts</SelectItem>
                {hosts.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
            <span className="tabular-nums">
              {hasFilters
                ? `${filtered.length} of ${vms.length}`
                : `${vms.length} ${vms.length === 1 ? "machine" : "machines"}`}
            </span>
            <button
              type="button"
              onClick={() => palette.setOpen(true)}
              className="flex h-8 items-center gap-2 border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Commands
              <KbdGroup keys={[modKey, "K"]} />
            </button>
            {canCreate && (
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link to="/dashboard/provision">
                  <Plus className="size-4" />
                  New VM
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {vms.length === 0 ? (
        <EmptyState
          icon={<Server className="size-6" />}
          title="No virtual machines yet"
          description="Provision one from an image in the registry. It shows up here as soon as libvirt knows about it."
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link to="/dashboard/provision">
                  <Plus className="size-4" />
                  Provision a VM
                </Link>
              </Button>
            ) : null
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="No machines match"
          description={
            query
              ? `Nothing matches “${query}” with the current filters.`
              : "Nothing matches the current filters."
          }
          action={
            <Button size="sm" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-11" />
            <col />
            <col className="w-[8rem]" />
            <col className="w-[12rem]" />
            <col className="hidden w-[11.5rem] 2xl:table-column" />
            <col className="w-[10.5rem]" />
            <col className="hidden w-[6rem] 2xl:table-column" />
            <col className="w-[5.5rem]" />
            <col className="w-[9.5rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
            <tr className="h-10 text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="pl-4">
                <Checkbox
                  aria-label="Select all visible machines"
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAll}
                  className="rounded-none"
                />
              </th>
              <SortHeader label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Status" k="state" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Operating system" k="os" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Resources" k="resources" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden 2xl:table-cell" />
              <SortHeader label="IP address" k="ipv4" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Host" k="host" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden 2xl:table-cell" />
              <SortHeader label="Access" k="credentials" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th scope="col" className="pr-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((vm) => (
              <VmRow
                key={vm.id}
                vm={vm}
                open={vm.id === openVmId}
                checked={selected.has(vm.id)}
                onToggle={() => toggleOne(vm.id)}
                onOpen={() => onOpen(vm)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 font-medium", className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "group/sort -ml-1 inline-flex h-7 items-center gap-1 px-1 transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5 text-primary" />
          ) : (
            <ArrowDown className="size-3.5 text-primary" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-0 transition-opacity group-hover/sort:opacity-60" />
        )}
      </button>
    </th>
  );
}

function VmRow({
  vm,
  open,
  checked,
  onToggle,
  onOpen,
}: {
  vm: VirtualMachineMetadata;
  open: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { primary, pendingOp } = useVmActions(vm);
  const PrimaryIcon = primary.icon;

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-row-click="true"], button, a, input, [role="menu"]')) {
      return;
    }
    onOpen();
  };

  return (
    <tr
      tabIndex={0}
      data-state={open ? "open" : undefined}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className={cn(
        "group/row h-[52px] cursor-pointer border-b border-border/70 transition-colors last:border-b-0 focus-visible:outline-none",
        "hover:bg-secondary/55 focus-visible:bg-secondary/55",
        open && "bg-primary/[0.06] hover:bg-primary/[0.08]",
        checked && !open && "bg-secondary/25",
        pendingOp && "opacity-80",
      )}
    >
      <td className="relative pl-4">
        {open && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-0.5 bg-primary"
          />
        )}
        <Checkbox
          aria-label={`Select ${vm.name}`}
          checked={checked}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="rounded-none"
        />
      </td>
      <td className="px-3">
        <span
          className="block truncate font-mono text-[13.5px] font-medium text-foreground"
          title={vm.name}
        >
          {vm.name}
        </span>
      </td>
      <td className="px-3">
        <VmStatus vm={vm} pendingOp={pendingOp} />
      </td>
      <td className="px-3">
        <VmOsLabel image={vm.os} />
      </td>
      <td className="hidden px-3 2xl:table-cell">
        <ResourceSummary vm={vm} />
      </td>
      <td className="px-3">
        {vm.ipv4 ? (
          <CopyText value={vm.ipv4} label="IP address" className="text-[13px]" />
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
      <td className="hidden px-3 text-muted-foreground 2xl:table-cell">
        {hostLabel(vm)}
      </td>
      <td className="px-3">
        <AccessSummary vm={vm} />
      </td>
      <td className="pr-3">
        <div className="flex items-center justify-end gap-1">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-disabled={!primary.enabled}
                data-no-row-click="true"
                onClick={(e) => {
                  e.stopPropagation();
                  if (primary.enabled) primary.run();
                }}
                className={cn(
                  "h-7 min-w-[5.5rem] bg-transparent px-2.5 text-xs",
                  primary.id === "connect" && primary.enabled &&
                    "border-primary/50 text-primary hover:bg-primary/10 hover:text-primary",
                  !primary.enabled && "cursor-not-allowed opacity-40",
                )}
              >
                {primary.pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <PrimaryIcon className="size-3.5" />
                )}
                {primary.label}
              </Button>
            </TooltipTrigger>
            {!primary.enabled && primary.reason && (
              <TooltipContent side="left">{primary.reason}</TooltipContent>
            )}
          </Tooltip>
          <VmActionMenu vm={vm} />
        </div>
      </td>
    </tr>
  );
}

function ResourceSummary({ vm }: { vm: VirtualMachineMetadata }) {
  return (
    <span className="grid grid-cols-3 gap-x-2 font-mono text-[13px] tabular-nums">
      <span className="truncate">
        {vm.vcpus}
        <span className="ml-0.5 text-[11px] text-muted-foreground">vCPU</span>
      </span>
      <span className="truncate">
        {vm.mem}
        <span className="ml-0.5 text-[11px] text-muted-foreground">GB</span>
      </span>
      <span className="truncate">
        {vm.disk_size}
        <span className="ml-0.5 text-[11px] text-muted-foreground">GB</span>
      </span>
    </span>
  );
}

function AccessSummary({ vm }: { vm: VirtualMachineMetadata }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[13px] tabular-nums">
      <span
        className={cn(
          "inline-flex items-center gap-1",
          vm.credentials_count === 0 && "text-muted-foreground/60",
        )}
        title={`${vm.credentials_count} credential${vm.credentials_count === 1 ? "" : "s"}`}
      >
        <KeyRound className="size-3.5 text-muted-foreground" />
        <span className="font-mono">{vm.credentials_count}</span>
      </span>
      {vm.ssh_enabled && (
        <span
          className="inline-flex items-center text-muted-foreground"
          title="SSH allowed"
        >
          <Terminal className="size-3.5" />
          <span className="sr-only">SSH allowed</span>
        </span>
      )}
    </span>
  );
}

function BulkBar({
  selected,
  onClear,
  onBulk,
}: {
  selected: VirtualMachineMetadata[];
  onClear: () => void;
  onBulk: (action: "start" | "stop" | "delete", vms: VirtualMachineMetadata[]) => void;
}) {
  const authz = useAuthz();

  const describe = (id: VmActionId) => {
    const missing = authz.missingPolicies(policiesFor(id));
    const applicable = selected.filter((vm) => stateAllows(id, vm.state).ok);
    return { missing, applicable };
  };

  const items: {
    id: "start" | "stop" | "delete";
    label: string;
    icon: typeof Play;
    destructive?: boolean;
  }[] = [
    { id: "start", label: "Start", icon: Play },
    { id: "stop", label: "Stop", icon: Square },
    { id: "delete", label: "Delete", icon: Trash2, destructive: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/[0.06] px-4 py-2.5">
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="inline-flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <span className="text-sm">
        <span className="font-mono font-medium text-primary">{selected.length}</span>{" "}
        selected
      </span>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {items.map((item) => {
        const { missing, applicable } = describe(item.id);
        const enabled = missing.length === 0 && applicable.length > 0;
        const reason =
          missing.length > 0
            ? formatMissingPolicies(missing)
            : applicable.length === 0
              ? `None of the selected machines can be ${item.id === "start" ? "started" : item.id === "stop" ? "stopped" : "deleted"} right now`
              : applicable.length < selected.length
                ? `Applies to ${applicable.length} of ${selected.length}`
                : undefined;
        const Icon = item.icon;
        return (
          <Tooltip key={item.id} delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={item.destructive ? "ghost" : "outline"}
                aria-disabled={!enabled}
                onClick={() => enabled && onBulk(item.id, applicable)}
                className={cn(
                  "h-8 bg-transparent",
                  item.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
                  !enabled && "cursor-not-allowed opacity-45",
                )}
              >
                <Icon className="size-4" />
                {item.label}
                {enabled && applicable.length < selected.length && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {applicable.length}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {reason && <TooltipContent side="bottom">{reason}</TooltipContent>}
          </Tooltip>
        );
      })}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div className="flex size-12 items-center justify-center border border-border bg-secondary text-muted-foreground">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="font-mono text-base font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
