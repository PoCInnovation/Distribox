import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarX,
  Keyboard,
  Pencil,
  Presentation,
  Terminal,
  Trash2,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useEvent, useDeleteEvent, useDeleteEventVm } from "@/hooks/useEvents";
import { useVMs } from "@/hooks/useVMs";
import { VmActionsProvider, type VmActionHandlers } from "@/hooks/useVmActions";
import { useTimezone, formatDateTime } from "@/hooks/useTimezone";
import { useAuthz } from "@/contexts/authz-context";
import { isForbiddenError } from "@/lib/api";
import { getKeyboardLabel } from "@/lib/keyboard-layouts";
import { Policy, VMState, type VirtualMachineMetadata } from "@/lib/types";
import type { Event } from "@/lib/types/event";
import { cn } from "@/lib/utils";
import { VmDrawer } from "./vm-drawer";
import { RenameVMDialog } from "./RenameVMDialog";
import { VmOsLabel } from "./vm-os-label";
import { EventFormDialog } from "./events/event-form-dialog";
import { PresentOverlay } from "./events/present-overlay";
import {
  ParticipantsSection,
  type ParticipantRow,
  type ParticipantView,
} from "./events/participants";
import {
  EventStatus,
  SeatMeter,
  ShareLink,
  SpecSummary,
} from "./events/event-bits";
import {
  deadlineText,
  displayUrl,
  eventShareUrl,
  getEventPhase,
  useNow,
} from "./events/event-model";
import { EmptyState } from "./events/empty-state";

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event, isLoading, isError, error } = useEvent(eventId ?? "");

  if (isLoading) return <DetailSkeleton />;

  if (isError && isForbiddenError(error)) {
    return (
      <div className="space-y-6">
        <BackLink />
        <PolicyNotice
          title="Event hidden"
          missingPolicies={error.missingPolicies}
        />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="border border-border bg-card">
          <EmptyState
            icon={<CalendarX className="size-6" />}
            title="Event not found"
            description="It may have been deleted, or the link you followed is out of date."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/events">Back to events</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return <EventDetail event={event} />;
}

function BackLink() {
  return (
    <Link
      to="/dashboard/events"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Events
    </Link>
  );
}

const VIEW_PARAM = "view";
const VM_PARAM = "vm";

function EventDetail({ event }: { event: Event }) {
  const navigate = useNavigate();
  const authz = useAuthz();
  const timeZone = useTimezone();
  const now = useNow(15_000);
  const [searchParams, setSearchParams] = useSearchParams();

  const canUpdate = authz.hasPolicy(Policy.EVENTS_UPDATE);
  const canDelete = authz.hasPolicy(Policy.EVENTS_DELETE);
  const canScreenshot = authz.hasPolicy(Policy.VMS_SCREENSHOT);

  const deleteEvent = useDeleteEvent();
  const deleteEventVm = useDeleteEventVm();
  const {
    vms,
    isLoading: vmsLoading,
    isError: vmsError,
    pendingById,
    startVM,
    stopVM,
    restartVM,
    duplicateVM,
    renameVM,
  } = useVMs();

  const [editOpen, setEditOpen] = useState(searchParams.get("edit") === "1");
  const [presenting, setPresenting] = useState(
    searchParams.get("present") === "1",
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toRemove, setToRemove] = useState<ParticipantRow | null>(null);
  const [vmToRename, setVmToRename] = useState<VirtualMachineMetadata | null>(
    null,
  );

  const view: ParticipantView =
    searchParams.get(VIEW_PARAM) === "table" ? "table" : "screens";
  const openVmId = searchParams.get(VM_PARAM);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // One-shot deep links from the list's row menu.
  useEffect(() => {
    if (searchParams.has("edit") || searchParams.has("present")) {
      updateParams({ edit: null, present: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo<ParticipantRow[]>(() => {
    const byId = new Map((vms ?? []).map((vm) => [vm.id, vm]));
    return event.participants.map((participant) => ({
      participant,
      vm: byId.get(participant.vm_id),
    }));
  }, [event.participants, vms]);

  const openVm = rows.find((r) => r.vm?.id === openVmId)?.vm ?? null;

  useEffect(() => {
    if (openVmId && vms && !rows.some((r) => r.vm?.id === openVmId)) {
      updateParams({ [VM_PARAM]: null });
    }
  }, [openVmId, vms, rows, updateParams]);

  const handlers = useMemo<VmActionHandlers>(
    () => ({
      connect: (vm) =>
        window.open(`/client?vm_id=${encodeURIComponent(vm.id)}`, "_blank"),
      start: (vm) => void startVM(vm.id),
      stop: (vm) => void stopVM(vm.id),
      restart: (vm) => void restartVM(vm.id),
      duplicate: (vm) => void duplicateVM(vm.id),
      rename: (vm) => setVmToRename(vm),
      // Deleting an event VM goes through the event so the seat is freed.
      delete: (vm) => {
        const row = event.participants.find((p) => p.vm_id === vm.id);
        if (row) setToRemove({ participant: row, vm });
      },
    }),
    [startVM, stopVM, restartVM, duplicateVM, event.participants],
  );

  const ui = getEventPhase(event, now);
  const ended = ui.phase === "ended";
  const url = eventShareUrl(event.slug);
  const runningCount = rows.filter(
    (r) => r.vm?.state === VMState.RUNNING,
  ).length;

  return (
    <VmActionsProvider handlers={handlers} pendingById={pendingById}>
      <div className="space-y-6 pb-10">
        <BackLink />

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-mono text-3xl font-bold tracking-tight text-balance">
              {event.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <EventStatus ui={ui} />
              <span className="text-border">|</span>
              <span className="text-muted-foreground">
                {ended ? "Joining closed " : "Joining closes "}
                {deadlineText(event.deadline, now)}
              </span>
              <span className="text-border">|</span>
              <span className="text-muted-foreground">
                Created by{" "}
                <span className="text-foreground/85">{event.created_by}</span>{" "}
                on{" "}
                {formatDateTime(event.created_at, timeZone, {
                  hour: undefined,
                  minute: undefined,
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresenting(true)}
              disabled={ended}
              title={
                ended
                  ? "The link is closed"
                  : "Show the link full screen for a projector"
              }
            >
              <Presentation className="size-4" />
              Present link
            </Button>
            {canUpdate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete event"
                    onClick={() => setDeleteOpen(true)}
                    className="ml-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete event</TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        {/* Facts strip */}
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,2.1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.75fr)]">
          <Fact
            label={ended ? "Join link (closed)" : "Join link"}
            className="sm:col-span-2 xl:col-span-4 2xl:col-span-1"
          >
            {ended ? (
              <div className="flex h-9 items-center border border-dashed border-border px-3 font-mono text-[13px] text-muted-foreground line-through decoration-muted-foreground/40">
                <span className="truncate">{displayUrl(url)}</span>
              </div>
            ) : (
              <ShareLink url={url} className="max-w-2xl" />
            )}
          </Fact>
          <Fact label="Seats">
            <SeatMeter
              used={event.participants_count}
              total={event.max_vms}
              className="max-w-[9rem]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {event.participants_count >= event.max_vms
                ? "All taken"
                : `${event.max_vms - event.participants_count} left`}
              {rows.length > 0 && `, ${runningCount} running`}
            </p>
          </Fact>
          <Fact label="Deadline">
            <span
              className={cn(
                "block font-mono text-[13px] tabular-nums",
                ui.phase === "closing"
                  ? "text-warning"
                  : ended
                    ? "text-muted-foreground"
                    : "",
              )}
            >
              {formatDateTime(event.deadline, timeZone)}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              {ended
                ? "VMs stay until removed"
                : "Existing VMs keep running after it"}
            </p>
          </Fact>
          <Fact label="Each participant gets">
            <VmOsLabel image={event.vm_os} logoClassName="size-6" />
            <SpecSummary
              vcpus={event.vm_vcpus}
              mem={event.vm_mem}
              disk={event.vm_disk_size}
              className="mt-1.5"
            />
          </Fact>
          <Fact label="Access">
            <span className="flex items-center gap-2 text-sm">
              <Terminal className="size-3.5 text-muted-foreground" />
              {event.ssh_enabled ? "SSH allowed" : "Browser only"}
            </span>
            <span className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Keyboard className="size-3.5" />
              {event.keyboard_layout
                ? getKeyboardLabel(event.keyboard_layout)
                : "VM default"}
            </span>
          </Fact>
        </div>

        {/* Participants */}
        <ParticipantsSection
          rows={rows}
          vmsHidden={vmsError}
          vmsLoading={vmsLoading}
          canScreenshot={canScreenshot}
          view={view}
          onViewChange={(v) =>
            updateParams({ [VIEW_PARAM]: v === "screens" ? null : v })
          }
          openVmId={openVm?.id ?? null}
          onOpen={(vm) => updateParams({ [VM_PARAM]: vm.id })}
          onRemove={canDelete ? (row) => setToRemove(row) : undefined}
          now={now}
          emptyHint={
            ended ? (
              "The deadline passed before anyone joined."
            ) : (
              <>
                Share the join link. Each person who opens it and enters a name
                shows up here with a live view of their screen.
              </>
            )
          }
        />
      </div>

      <VmDrawer
        vm={openVm}
        open={!!openVm}
        onOpenChange={(open) => {
          if (!open) updateParams({ [VM_PARAM]: null });
        }}
      />

      <RenameVMDialog
        open={!!vmToRename}
        onOpenChange={(open) => {
          if (!open) setVmToRename(null);
        }}
        vm={vmToRename}
        onRename={renameVM}
      />

      {canUpdate && (
        <EventFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          event={event}
        />
      )}

      {presenting && (
        <PresentOverlay event={event} onClose={() => setPresenting(false)} />
      )}

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        title={`Remove ${toRemove?.participant.participant_name ?? "this participant"}?`}
        description={
          <>
            <p>
              Their VM is stopped and deleted, along with its access secret, and
              the seat becomes free again. This cannot be undone.
            </p>
            {toRemove?.vm && (
              <p className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
                {toRemove.vm.name}
              </p>
            )}
          </>
        }
        confirmLabel={
          <>
            <UserMinus />
            Remove participant
          </>
        }
        destructive
        pending={deleteEventVm.isPending}
        onConfirm={() => {
          if (!toRemove) return;
          const vmId = toRemove.participant.vm_id;
          deleteEventVm.mutate(
            { eventId: event.id, vmId },
            {
              onSuccess: () => {
                setToRemove(null);
                if (openVmId === vmId) updateParams({ [VM_PARAM]: null });
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this event?"
        description={
          <>
            <p>
              The join link stops working and{" "}
              {event.participants_count > 0
                ? `all ${event.participants_count} participant ${event.participants_count === 1 ? "VM is" : "VMs are"}`
                : "any participant VMs are"}{" "}
              stopped and deleted. This cannot be undone.
            </p>
            <p className="border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {event.name}
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
        onConfirm={() =>
          deleteEvent.mutate(event.id, {
            onSuccess: () => navigate("/dashboard/events"),
          })
        }
      />
    </VmActionsProvider>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-3.5", className)}>
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading event">
      <div className="h-4 w-20 animate-pulse bg-secondary" />
      <div className="space-y-3">
        <div className="h-8 w-80 animate-pulse bg-secondary" />
        <div className="h-4 w-96 animate-pulse bg-secondary" />
      </div>
      <div className="h-24 animate-pulse border border-border bg-card" />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[16/10] animate-pulse border border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
