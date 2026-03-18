import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  HardDrive,
  Link2,
  MemoryStick,
  Monitor,
  Pencil,
  Save,
  Server,
  Trash2,
  Users,
  X,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EventInfoCard } from "@/components/event-info-card";
import {
  useEvent,
  useUpdateEvent,
  useDeleteEvent,
  useDeleteEventVm,
} from "@/hooks/useEvents";
import { useHostInfo } from "@/hooks/useHostInfo";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { VMImageSelect } from "./vm-image-picker";
import { VmMonitorTile } from "./vm-monitor-tile";
import {
  DateTimePicker,
  VmSpecFields,
  HostResourcesBar,
  ResourceWarnings,
} from "./event-form-fields";
import type { VirtualMachineMetadata } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { FRONTEND_URL, getVMs } from "@/lib/api";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const authz = useAuthz();

  const now = useNow(10000);
  const { data: event, isLoading, isError } = useEvent(eventId ?? "");
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const deleteEventVm = useDeleteEventVm();

  const canUpdate = authz.hasPolicy(Policy.EVENTS_UPDATE);
  const canDelete = authz.hasPolicy(Policy.EVENTS_DELETE);
  const canReadHost = authz.hasPolicy(Policy.HOST_GET);
  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);

  const [editing, setEditing] = useState(false);
  const { data: hostInfo } = useHostInfo(canReadHost && editing, 2000);

  const [editName, setEditName] = useState("");
  const [editOS, setEditOS] = useState("");
  const [editVcpus, setEditVcpus] = useState("");
  const [editMem, setEditMem] = useState("");
  const [editDisk, setEditDisk] = useState("");
  const [editMaxVms, setEditMaxVms] = useState("");
  const [editDeadline, setEditDeadline] = useState<Date | undefined>(undefined);

  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteVmConfirm, setDeleteVmConfirm] = useState<string | null>(null);
  const [deleteEventConfirm, setDeleteEventConfirm] = useState(false);

  const participantVmIds = new Set(
    event?.participants.map((p) => p.vm_id) ?? [],
  );

  const { data: allVms } = useQuery<VirtualMachineMetadata[]>({
    queryKey: ["vms"],
    queryFn: getVMs,
    refetchInterval: 5000,
    retry: false,
    enabled: !!event,
  });

  const eventVms = allVms?.filter((vm) => participantVmIds.has(vm.id)) ?? [];

  const startEditing = () => {
    if (!event) return;
    setEditName(event.name);
    setEditOS(event.vm_os);
    setEditVcpus(String(event.vm_vcpus));
    setEditMem(String(event.vm_mem));
    setEditDisk(String(event.vm_disk_size));
    setEditMaxVms(String(event.max_vms));
    setEditDeadline(new Date(event.deadline));
    setEditing(true);
  };

  const handleSave = async () => {
    if (!event) return;
    try {
      await updateEvent.mutateAsync({
        eventId: event.id,
        payload: {
          name: editName.trim() || undefined,
          vm_os: editOS || undefined,
          vm_vcpus: Number.parseInt(editVcpus) || undefined,
          vm_mem: Number.parseInt(editMem) || undefined,
          vm_disk_size: Number.parseInt(editDisk) || undefined,
          max_vms: Number.parseInt(editMaxVms) || undefined,
          deadline: editDeadline ? editDeadline.toISOString() : undefined,
        },
      });
      setEditing(false);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleDeleteEvent = () => {
    if (!event) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => navigate("/dashboard/events"),
    });
  };

  const handleDeleteVm = () => {
    if (!event || !deleteVmConfirm) return;
    deleteEventVm.mutate(
      { eventId: event.id, vmId: deleteVmConfirm },
      { onSuccess: () => setDeleteVmConfirm(null) },
    );
  };

  const shareUrl = event ? `${FRONTEND_URL}/events/${event.slug}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading event...
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        Event not found
      </div>
    );
  }

  const expired = new Date(event.deadline) < now;
  const participantForVm = (vmId: string) =>
    event.participants.find((p) => p.vm_id === vmId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard/events")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight">
              {event.name}
            </h1>
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
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            /{event.slug}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShareLinkOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            Open Share Preview
          </Button>
          {canUpdate && !editing && (
            <Button variant="outline" onClick={startEditing}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              onClick={() => setDeleteEventConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Event Info / Edit */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OS Image</Label>
                    <VMImageSelect
                      selectedOS={editOS}
                      setSelectedOS={setEditOS}
                      enabled={canReadImages}
                    />
                  </div>
                  <VmSpecFields
                    vcpus={editVcpus}
                    onVcpusChange={setEditVcpus}
                    mem={editMem}
                    onMemChange={setEditMem}
                    diskSize={editDisk}
                    onDiskChange={setEditDisk}
                    maxCpus={hostInfo?.cpu.cpu_count}
                  />
                  <div className="space-y-2">
                    <Label>Max Participants</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editMaxVms}
                      onChange={(e) => setEditMaxVms(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Deadline</Label>
                    <DateTimePicker
                      value={editDeadline}
                      onChange={setEditDeadline}
                      side="bottom"
                    />
                  </div>
                  {hostInfo && <HostResourcesBar hostInfo={hostInfo} />}
                  {hostInfo && (
                    <ResourceWarnings
                      vcpus={Number.parseInt(editVcpus) || 0}
                      mem={Number.parseInt(editMem) || 0}
                      diskSize={Number.parseInt(editDisk) || 0}
                      maxVms={Number.parseInt(editMaxVms) || 0}
                      hostInfo={hostInfo}
                    />
                  )}

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleSave}
                      disabled={updateEvent.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {updateEvent.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <InfoRow
                    icon={<Server className="h-4 w-4 text-primary" />}
                    label="OS"
                    value={event.vm_os.replace(".qcow2", "")}
                  />
                  <InfoRow
                    icon={<Cpu className="h-4 w-4 text-primary" />}
                    label="vCPUs"
                    value={String(event.vm_vcpus)}
                  />
                  <InfoRow
                    icon={<MemoryStick className="h-4 w-4 text-chart-2" />}
                    label="Memory"
                    value={`${event.vm_mem} GB`}
                  />
                  <InfoRow
                    icon={<HardDrive className="h-4 w-4 text-chart-4" />}
                    label="Disk"
                    value={`${event.vm_disk_size} GB`}
                  />
                  <Separator />
                  <InfoRow
                    icon={<Users className="h-4 w-4" />}
                    label="Participants"
                    value={`${event.participants_count} / ${event.max_vms}`}
                  />
                  <InfoRow
                    icon={<Calendar className="h-4 w-4" />}
                    label="Deadline"
                    value={formatDeadline(event.deadline)}
                  />
                  <InfoRow
                    icon={<Clock className="h-4 w-4" />}
                    label="Created"
                    value={formatDeadline(event.created_at)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Participants list */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">
                Participants ({event.participants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {event.participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No participants yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {event.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md border border-border/50 bg-muted/20 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {p.participant_name}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          VM: {p.vm_id.slice(0, 8)}...
                        </p>
                      </div>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteVmConfirm(p.vm_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* VM Monitor Grid */}
        <div className="lg:col-span-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-5 w-5" />
                Virtual Machines ({eventVms.length})
              </CardTitle>
              <CardDescription>
                Live view of all VMs provisioned for this event
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventVms.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Monitor className="h-10 w-10" />
                  <p className="text-sm">No VMs provisioned yet</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                  {eventVms.map((vm) => {
                    const participant = participantForVm(vm.id);
                    return (
                      <div key={vm.id} className="space-y-1">
                        <VmMonitorTile vm={vm} />
                        {participant && (
                          <p className="px-1 text-xs text-muted-foreground">
                            {participant.participant_name}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Share Preview Overlay */}
      {shareLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-gradient-to-b from-primary to-background">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-6 top-6 z-10"
            onClick={() => setShareLinkOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          <div className="flex w-full flex-col items-center gap-8 px-4 py-12">
            {/* Big logo + branding */}
            <div className="flex flex-col items-center gap-4">
              <img
                src="/favicon.ico"
                width={120}
                height={120}
                alt="Distribox"
                draggable={false}
              />
              <h1 className="font-mono text-4xl font-bold tracking-wider">
                DISTRIBOX
              </h1>
            </div>

            {/* Event info card — same as /events/:slug */}
            <EventInfoCard
              name={event.name}
              description="Get yourself the following Virtual Machine through this Distribox Event Link!"
              vmOs={event.vm_os}
              vmVcpus={event.vm_vcpus}
              vmMem={event.vm_mem}
              vmDiskSize={event.vm_disk_size}
              participantsCount={event.participants_count}
              maxVms={event.max_vms}
              deadline={event.deadline}
              className="w-full max-w-lg"
            />

            {/* Share link */}
            <div className="border border-dashed border-primary/30 bg-card px-10 py-6 text-center">
              <p className="whitespace-nowrap font-mono text-3xl font-semibold text-primary">
                {shareUrl}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </>
                )}
              </Button>
              <Button onClick={() => window.open(shareUrl, "_blank")}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete VM Confirm */}
      <Dialog
        open={!!deleteVmConfirm}
        onOpenChange={(open) => !open && setDeleteVmConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Participant VM</DialogTitle>
            <DialogDescription>
              This will stop and delete the VM for this participant. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteVmConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteVm}
              disabled={deleteEventVm.isPending}
            >
              {deleteEventVm.isPending ? "Removing..." : "Remove VM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Event Confirm */}
      <Dialog open={deleteEventConfirm} onOpenChange={setDeleteEventConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              This will delete <strong>{event.name}</strong> and all its VMs.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteEventConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteEvent}
              disabled={deleteEvent.isPending}
            >
              {deleteEvent.isPending ? "Deleting..." : "Delete Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}
