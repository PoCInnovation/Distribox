import { useMemo, useState } from "react";
import {
  LayoutGrid,
  List,
  Loader2,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVmActions } from "@/hooks/useVmActions";
import { useTimezone, formatDateTime } from "@/hooks/useTimezone";
import type { EventParticipant } from "@/lib/types/event";
import type { VirtualMachineMetadata } from "@/lib/types";
import { getStatusBucket, type StatusBucket } from "@/lib/vm-state-ui";
import { cn } from "@/lib/utils";
import { CopyText } from "../copy-text";
import { VmStatus } from "../vm-status";
import { hostLabel } from "../vms-table";
import { EmptyState } from "./empty-state";
import { MissingParticipantTile, ParticipantTile } from "./participant-tile";
import { ParticipantMenu } from "./participant-menu";
import { timeAgo } from "./event-model";

export interface ParticipantRow {
  participant: EventParticipant;
  vm: VirtualMachineMetadata | undefined;
}

export type ParticipantView = "screens" | "table";

type Filter = "all" | StatusBucket;

export function ParticipantsSection({
  rows,
  vmsHidden,
  vmsLoading,
  canScreenshot,
  view,
  onViewChange,
  openVmId,
  onOpen,
  onRemove,
  now,
  emptyHint,
}: {
  rows: ParticipantRow[];
  /** The user cannot list VMs; only names are known. */
  vmsHidden: boolean;
  vmsLoading: boolean;
  canScreenshot: boolean;
  view: ParticipantView;
  onViewChange: (view: ParticipantView) => void;
  openVmId: string | null;
  onOpen: (vm: VirtualMachineMetadata) => void;
  onRemove?: (row: ParticipantRow) => void;
  now: Date;
  emptyHint: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: rows.length, running: 0, stopped: 0, other: 0 };
    for (const r of rows) if (r.vm) c[getStatusBucket(r.vm.state)] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && (!r.vm || getStatusBucket(r.vm.state) !== filter))
        return false;
      if (!q) return true;
      return (
        r.participant.participant_name.toLowerCase().includes(q) ||
        (r.vm?.name.toLowerCase().includes(q) ?? false) ||
        (r.vm?.ipv4 ?? "").includes(q)
      );
    });
  }, [rows, query, filter]);

  const hasFilters = query !== "" || filter !== "all";

  return (
    <section aria-label="Participants" className="border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="mr-1 flex items-baseline gap-2 font-mono text-sm font-bold">
          Participants
          <span className="font-normal text-muted-foreground tabular-nums">
            {rows.length}
          </span>
        </h2>

        {rows.length > 0 && (
          <>
            <div className="relative w-full max-w-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or IP"
                aria-label="Search participants"
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

            {!vmsHidden && (
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
                    aria-checked={filter === value}
                    onClick={() => setFilter(value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 transition-colors not-first:border-l not-first:border-border",
                      filter === value
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        filter === value
                          ? "text-primary"
                          : "text-muted-foreground/70",
                      )}
                    >
                      {counts[value]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {vmsLoading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          <div
            role="radiogroup"
            aria-label="Participants view"
            className="flex h-8 items-stretch border border-border text-sm"
          >
            {(
              [
                ["screens", "Screens", LayoutGrid],
                ["table", "Table", List],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => onViewChange(value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 transition-colors not-first:border-l not-first:border-border",
                  view === value
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-4", view === value && "text-primary")}
                />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="Nobody has joined yet"
          description={emptyHint}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="No participants match"
          description={
            query
              ? `Nothing matches “${query}”.`
              : "Nothing matches the current filter."
          }
          action={
            hasFilters ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : view === "screens" ? (
        <div
          className={cn(
            "grid gap-4 p-4",
            filtered.length > 9
              ? "md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "md:grid-cols-2 2xl:grid-cols-3",
          )}
        >
          {filtered.map((row) =>
            row.vm ? (
              <ParticipantTile
                key={row.participant.id}
                row={{ ...row, vm: row.vm }}
                open={row.vm.id === openVmId}
                canScreenshot={canScreenshot}
                onOpen={() => row.vm && onOpen(row.vm)}
                onRemove={onRemove ? () => onRemove(row) : undefined}
              />
            ) : (
              <MissingParticipantTile
                key={row.participant.id}
                row={row}
                hidden={vmsHidden || vmsLoading}
                onRemove={onRemove ? () => onRemove(row) : undefined}
              />
            ),
          )}
        </div>
      ) : (
        <ParticipantsTable
          rows={filtered}
          openVmId={openVmId}
          onOpen={onOpen}
          onRemove={onRemove}
          now={now}
        />
      )}
    </section>
  );
}

function ParticipantsTable({
  rows,
  openVmId,
  onOpen,
  onRemove,
  now,
}: {
  rows: ParticipantRow[];
  openVmId: string | null;
  onOpen: (vm: VirtualMachineMetadata) => void;
  onRemove?: (row: ParticipantRow) => void;
  now: Date;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col />
        <col className="w-[9rem]" />
        <col className="w-[11rem]" />
        <col className="w-[8rem]" />
        <col className="w-[8rem]" />
        <col className="w-[9.5rem]" />
      </colgroup>
      <thead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
        <tr className="h-10 text-left text-xs font-medium text-muted-foreground">
          <th scope="col" className="pl-5 pr-3 font-medium">
            Participant
          </th>
          <th scope="col" className="px-3 font-medium">
            Status
          </th>
          <th scope="col" className="px-3 font-medium">
            IP address
          </th>
          <th scope="col" className="px-3 font-medium">
            Host
          </th>
          <th scope="col" className="px-3 font-medium">
            Joined
          </th>
          <th scope="col" className="pr-3">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) =>
          row.vm ? (
            <ParticipantTableRow
              key={row.participant.id}
              row={row}
              vm={row.vm}
              open={row.vm.id === openVmId}
              onOpen={() => row.vm && onOpen(row.vm)}
              onRemove={onRemove ? () => onRemove(row) : undefined}
              now={now}
            />
          ) : (
            <tr
              key={row.participant.id}
              className="h-[52px] border-b border-border/70 last:border-b-0"
            >
              <td className="pl-5 pr-3">
                <span className="block truncate font-mono text-[13.5px] font-medium">
                  {row.participant.participant_name}
                </span>
              </td>
              <td colSpan={4} className="px-3 text-muted-foreground">
                VM disconnected
              </td>
              <td className="pr-3 text-right">
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(row)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Free the seat
                  </button>
                )}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function ParticipantTableRow({
  row,
  vm,
  open,
  onOpen,
  onRemove,
  now,
}: {
  row: ParticipantRow;
  vm: VirtualMachineMetadata;
  open: boolean;
  onOpen: () => void;
  onRemove?: () => void;
  now: Date;
}) {
  const timeZone = useTimezone();
  const { primary, pendingOp } = useVmActions(vm);
  const PrimaryIcon = primary.icon;

  return (
    <tr
      tabIndex={0}
      data-state={open ? "open" : undefined}
      onClick={(e) => {
        if (
          (e.target as HTMLElement).closest(
            '[data-no-row-click="true"], button, a, input, [role="menu"]',
          )
        )
          return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className={cn(
        "group/row h-[52px] cursor-pointer border-b border-border/70 transition-colors last:border-b-0 focus-visible:outline-none",
        "hover:bg-secondary/55 focus-visible:bg-secondary/55",
        open && "bg-primary/[0.06] hover:bg-primary/[0.08]",
        pendingOp && "opacity-80",
      )}
    >
      <td className="relative pl-5 pr-3">
        {open && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-0.5 bg-primary"
          />
        )}
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span
            className="truncate font-mono text-[13.5px] font-medium text-foreground"
            title={row.participant.participant_name}
          >
            {row.participant.participant_name}
          </span>
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={vm.name}
          >
            {vm.name}
          </span>
        </span>
      </td>
      <td className="px-3">
        <VmStatus vm={vm} pendingOp={pendingOp} />
      </td>
      <td className="px-3">
        {vm.ipv4 ? (
          <CopyText
            value={vm.ipv4}
            label="IP address"
            className="text-[13px]"
          />
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
      <td className="px-3 text-muted-foreground">{hostLabel(vm)}</td>
      <td
        className="px-3 text-muted-foreground tabular-nums"
        title={formatDateTime(row.participant.created_at, timeZone)}
      >
        {timeAgo(row.participant.created_at, now)}
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
                  primary.id === "connect" &&
                    primary.enabled &&
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
          <ParticipantMenu
            name={row.participant.participant_name}
            vm={vm}
            onOpen={onOpen}
            onRemove={onRemove}
          />
        </div>
      </td>
    </tr>
  );
}
