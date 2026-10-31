import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  CalendarClock,
  ChevronRight,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Presentation,
  RotateCw,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/components/ui/secret-field";
import { PolicyGate } from "@/components/policy/policy-gate";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useEvents, useDeleteEvent } from "@/hooks/useEvents";
import { useTimezone, formatDateTime } from "@/hooks/useTimezone";
import { useAuthz } from "@/contexts/authz-context";
import { isForbiddenError } from "@/lib/api";
import { Policy } from "@/lib/types";
import type { Event } from "@/lib/types/event";
import { cn } from "@/lib/utils";
import { CreateEventDialog } from "./create-event-dialog";
import { CopyText } from "./copy-text";
import { EventMachine, EventStatus, SeatMeter } from "./events/event-bits";
import {
  deadlineText,
  eventShareUrl,
  getEventPhase,
  runAgainHref,
  useNow,
} from "./events/event-model";
import { EmptyState } from "./events/empty-state";

type Filter = "all" | "active" | "ended";

export function EventsPage() {
  const authz = useAuthz();
  const canCreate = authz.hasPolicy(Policy.EVENTS_CREATE);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const againId = searchParams.get("again");
  const { data: events } = useEvents(canCreate && !!againId);
  const again = events?.find((e) => e.id === againId);

  return (
    <div className="h-full p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
            Events
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Hand out one identical VM per person through a public link, until
            the deadline or the last seat.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New event
          </Button>
        )}
      </header>

      <PolicyGate requiredPolicies={[Policy.EVENTS_GET]} title="Events hidden">
        <EventsTableContainer
          onCreate={canCreate ? () => setCreateOpen(true) : undefined}
        />
      </PolicyGate>

      <CreateEventDialog
        open={createOpen || !!again}
        source={again}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && againId) {
            setSearchParams(
              (params) => {
                params.delete("again");
                return params;
              },
              { replace: true },
            );
          }
        }}
      />
    </div>
  );
}

function EventsTableContainer({ onCreate }: { onCreate?: () => void }) {
  const { data: events, isLoading, isError, error } = useEvents();
  const deleteEvent = useDeleteEvent();
  const [toDelete, setToDelete] = useState<Event | null>(null);

  if (isError && isForbiddenError(error)) {
    return (
      <PolicyNotice
        title="Events hidden"
        missingPolicies={error.missingPolicies}
      />
    );
  }
  if (isError) {
    return (
      <PolicyNotice
        title="Events unavailable"
        description={error instanceof Error ? error.message : "Unknown error"}
        missingPolicies={[]}
      />
    );
  }

  return (
    <>
      {isLoading || !events ? (
        <TableSkeleton />
      ) : (
        <EventsTable
          events={events}
          onCreate={onCreate}
          onDelete={setToDelete}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Delete this event?"
        description={
          <>
            <p>
              The join link stops working and{" "}
              {toDelete?.participants_count
                ? `all ${toDelete.participants_count} participant ${toDelete.participants_count === 1 ? "VM is" : "VMs are"}`
                : "any participant VMs are"}{" "}
              stopped and deleted. This cannot be undone.
            </p>
            <p className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {toDelete?.name}
            </p>
          </>
        }
        confirmLabel={
          <>
            <Trash2 />
            Delete event
          </>
        }
        destructive
        pending={deleteEvent.isPending}
        onConfirm={() => {
          if (!toDelete) return;
          deleteEvent.mutate(toDelete.id, {
            onSuccess: () => setToDelete(null),
          });
        }}
      />
    </>
  );
}

function EventsTable({
  events,
  onCreate,
  onDelete,
}: {
  events: Event[];
  onCreate?: () => void;
  onDelete: (event: Event) => void;
}) {
  const now = useNow(30_000);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: events.length, active: 0, ended: 0 };
    for (const e of events) {
      if (getEventPhase(e, now).phase === "ended") c.ended += 1;
      else c.active += 1;
    }
    return c;
  }, [events, now]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = events.filter((e) => {
      const ended = getEventPhase(e, now).phase === "ended";
      if (filter === "active" && ended) return false;
      if (filter === "ended" && !ended) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.slug.includes(q) ||
        e.vm_os.toLowerCase().includes(q) ||
        e.participants.some((p) => p.participant_name.toLowerCase().includes(q))
      );
    });
    // Running events first, soonest deadline on top; ended ones after, most recent first.
    return list.sort((a, b) => {
      const ta = new Date(a.deadline).getTime();
      const tb = new Date(b.deadline).getTime();
      const ea = ta <= now.getTime();
      const eb = tb <= now.getTime();
      if (ea !== eb) return ea ? 1 : -1;
      return ea ? tb - ta : ta - tb;
    });
  }, [events, query, filter, now]);

  const hasFilters = query !== "" || filter !== "all";

  return (
    <section aria-label="Events" className="border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events or participants"
            aria-label="Search events"
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
          aria-label="Filter events"
          className="flex h-8 items-stretch border border-border text-sm"
        >
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["ended", "Ended"],
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

        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {hasFilters
            ? `${rows.length} of ${events.length}`
            : `${events.length} ${events.length === 1 ? "event" : "events"}`}
        </span>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-6" />}
          title="No events yet"
          description="An event gives everyone who opens its link their own VM, built from the same image and size, until the deadline."
          action={
            onCreate ? (
              <Button size="sm" onClick={onCreate}>
                <Plus className="size-4" />
                New event
              </Button>
            ) : null
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="No events match"
          description={
            query
              ? `Nothing matches “${query}” with the current filter.`
              : "Nothing matches the current filter."
          }
          action={
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
          }
        />
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col />
            <col className="w-[8.5rem]" />
            <col className="w-[13rem]" />
            <col className="w-[8rem]" />
            <col className="w-[11rem]" />
            <col className="hidden w-[14rem] 2xl:table-column" />
            <col className="w-[7rem] xl:w-[11rem]" />
          </colgroup>
          <thead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
            <tr className="h-10 text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="pl-5 pr-3 font-medium">
                Event
              </th>
              <th scope="col" className="px-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 font-medium">
                Machine
              </th>
              <th scope="col" className="px-3 font-medium">
                Seats
              </th>
              <th scope="col" className="px-3 font-medium">
                Deadline
              </th>
              <th
                scope="col"
                className="hidden px-3 font-medium 2xl:table-cell"
              >
                Join link
              </th>
              <th scope="col" className="pr-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                now={now}
                onDelete={() => onDelete(event)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EventRow({
  event,
  now,
  onDelete,
}: {
  event: Event;
  now: Date;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const authz = useAuthz();
  const canCreate = authz.hasPolicy(Policy.EVENTS_CREATE);
  const timeZone = useTimezone();
  const ui = getEventPhase(event, now);
  const ended = ui.phase === "ended";
  const url = eventShareUrl(event.slug);
  const href = `/dashboard/events/${event.id}`;

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[data-no-row-click="true"], button, a, input, [role="menu"]',
      )
    ) {
      return;
    }
    navigate(href);
  };

  return (
    <tr
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) navigate(href);
      }}
      className="group/row h-[60px] cursor-pointer border-b border-border/70 transition-colors last:border-b-0 hover:bg-secondary/55 focus-visible:bg-secondary/55 focus-visible:outline-none"
    >
      <td className="pl-5 pr-3">
        <Link
          to={href}
          className={cn(
            "block truncate font-mono text-[13.5px] font-medium hover:text-primary",
            ended ? "text-foreground/70" : "text-foreground",
          )}
          title={event.name}
        >
          {event.name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          by {event.created_by}
        </span>
      </td>
      <td className="px-3">
        <EventStatus ui={ui} />
      </td>
      <td className={cn("px-3", ended && "opacity-70")}>
        <EventMachine
          image={event.vm_os}
          vcpus={event.vm_vcpus}
          mem={event.vm_mem}
          disk={event.vm_disk_size}
        />
      </td>
      <td className="px-3">
        <SeatMeter
          used={event.participants_count}
          total={event.max_vms}
          dimmed={ended}
          className="max-w-[6.5rem]"
        />
      </td>
      <td className="px-3">
        <span
          className={cn(
            "block font-mono text-[13px] tabular-nums",
            ended
              ? "text-muted-foreground"
              : ui.phase === "closing"
                ? "text-warning"
                : "text-foreground",
          )}
        >
          {ended ? "ended " : "closes "}
          {deadlineText(event.deadline, now)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatDateTime(event.deadline, timeZone)}
        </span>
      </td>
      <td className="hidden px-3 2xl:table-cell">
        {ended ? (
          <span className="font-mono text-[13px] text-muted-foreground/60 line-through decoration-muted-foreground/40">
            /events/{event.slug}
          </span>
        ) : (
          <CopyText
            value={url}
            display={`/events/${event.slug}`}
            label="join link"
            className="text-[13px]"
          />
        )}
      </td>
      <td className="pr-3">
        <div className="flex items-center justify-end gap-1">
          {ended && canCreate && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Run again"
              title="Run again"
              onClick={() => navigate(runAgainHref(event.id))}
            >
              <RotateCw className="size-3.5" />
              <span className="hidden xl:inline">Run again</span>
            </Button>
          )}
          <EventRowMenu
            event={event}
            url={url}
            ended={ended}
            onDelete={onDelete}
          />
          <ChevronRight className="size-4 text-muted-foreground/50 transition-colors group-hover/row:text-muted-foreground" />
        </div>
      </td>
    </tr>
  );
}

function EventRowMenu({
  event,
  url,
  ended,
  onDelete,
}: {
  event: Event;
  url: string;
  ended: boolean;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const authz = useAuthz();
  const canCreate = authz.hasPolicy(Policy.EVENTS_CREATE);
  const canUpdate = authz.hasPolicy(Policy.EVENTS_UPDATE);
  const canDelete = authz.hasPolicy(Policy.EVENTS_DELETE);
  const href = `/dashboard/events/${event.id}`;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${event.name}`}
          data-no-row-click="true"
          className="text-muted-foreground hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-border bg-popover p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          onSelect={() => copyToClipboard(url, "Join link copied")}
        >
          <Copy className="size-4" />
          Copy join link
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => window.open(url, "_blank", "noopener")}
        >
          <ExternalLink className="size-4" />
          Open join page
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={ended}
          onSelect={() => navigate(`${href}?present=1`)}
        >
          <Presentation className="size-4" />
          Present link
        </DropdownMenuItem>
        {canCreate && (
          <DropdownMenuItem onSelect={() => navigate(runAgainHref(event.id))}>
            <RotateCw className="size-4" />
            Run again
          </DropdownMenuItem>
        )}
        {canUpdate && (
          <DropdownMenuItem onSelect={() => navigate(`${href}?edit=1`)}>
            <Pencil className="size-4" />
            Edit event
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4 text-destructive" />
              Delete event
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableSkeleton() {
  return (
    <div
      className="border border-border bg-card"
      aria-busy="true"
      aria-label="Loading events"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="h-8 w-72 animate-pulse bg-secondary" />
        <div className="h-8 w-56 animate-pulse bg-secondary" />
      </div>
      <div className="divide-y divide-border/70">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex h-[60px] items-center gap-8 px-5">
            <div className="h-3.5 w-48 animate-pulse bg-secondary" />
            <div className="h-3.5 w-20 animate-pulse bg-secondary" />
            <div className="h-3.5 w-40 animate-pulse bg-secondary" />
            <div className="h-3.5 w-24 animate-pulse bg-secondary" />
            <div className="h-3.5 w-32 animate-pulse bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}
