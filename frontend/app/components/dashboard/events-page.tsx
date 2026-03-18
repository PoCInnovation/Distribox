import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Calendar,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEvents, useDeleteEvent } from "@/hooks/useEvents";
import { CreateEventDialog } from "./create-event-dialog";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { PolicyGate } from "@/components/policy/policy-gate";
import type { Event } from "@/lib/types/event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DistroLogo } from "../distro-logo";

function isExpired(deadline: string): boolean {
  return new Date(deadline) < new Date();
}

function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeRemaining(deadline: string): string {
  const now = new Date();
  const end = new Date(deadline);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m remaining`;
}

function EventCard({
  event,
  onSelect,
  onDelete,
  canDelete,
}: {
  event: Event;
  onSelect: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const expired = isExpired(event.deadline);

  return (
    <Card
      className={`group relative cursor-pointer border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${
        expired ? "opacity-70" : ""
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{event.name}</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs">
              /{event.slug}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="default"
              className={
                expired
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-chart-3 bg-chart-3/10 text-chart-3"
              }
            >
              {expired ? "Expired" : "Active"}
            </Badge>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive hover:bg-destructive/10 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span>
              {event.participants_count}/{event.max_vms} participants
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="truncate">{timeRemaining(event.deadline)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            VM Spec
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <DistroLogo
                distribution={
                  event.vm_distribution || event.vm_os.replace(".qcow2", "")
                }
                className="w-5 h-5 rounded-none bg-transparent"
              />
              {event.vm_distribution || event.vm_os.replace(".qcow2", "")}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              {event.vm_vcpus} vCPU
            </div>
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <MemoryStick className="h-3.5 w-3.5 text-chart-2" />
              {event.vm_mem} GB
            </div>
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <HardDrive className="h-3.5 w-3.5 text-chart-4" />
              {event.vm_disk_size} GB
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>Deadline: {formatDeadline(event.deadline)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function EventsPage() {
  const navigate = useNavigate();
  const authz = useAuthz();
  const { data: events, isLoading, isError, error } = useEvents();
  const deleteEventMutation = useDeleteEvent();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const canCreate = authz.hasPolicy(Policy.EVENTS_CREATE);
  const canDelete = authz.hasPolicy(Policy.EVENTS_DELETE);

  const handleDelete = () => {
    if (!deleteConfirmId) return;
    deleteEventMutation.mutate(deleteConfirmId, {
      onSuccess: () => setDeleteConfirmId(null),
    });
  };

  const eventToDelete = events?.find((e) => e.id === deleteConfirmId);

  return (
    <PolicyGate requiredPolicies={[Policy.EVENTS_GET]} title="Events Hidden">
      <div className="space-y-6">
        {canCreate && (
          <div className="flex justify-end">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading events...
          </div>
        )}

        {isError && (
          <div className="flex h-64 items-center justify-center text-destructive">
            Failed to load events: {error?.message ?? "Unknown error"}
          </div>
        )}

        {events && events.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Calendar className="h-12 w-12" />
            <p className="text-lg">No events yet</p>
            {canCreate && (
              <p className="text-sm">
                Create your first event to start distributing VMs.
              </p>
            )}
          </div>
        )}

        {events && events.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onSelect={() => navigate(`/dashboard/events/${event.id}`)}
                onDelete={() => setDeleteConfirmId(event.id)}
                canDelete={canDelete}
              />
            ))}
          </div>
        )}

        <CreateEventDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />

        <Dialog
          open={!!deleteConfirmId}
          onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Event</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <strong>{eventToDelete?.name}</strong>? This will stop and
                remove all VMs associated with this event. This action cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteEventMutation.isPending}
              >
                {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PolicyGate>
  );
}
