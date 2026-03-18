import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Check } from "lucide-react";
import { useCreateEvent } from "@/hooks/useEvents";
import { useHostInfo } from "@/hooks/useHostInfo";
import { VMImageSelect } from "./vm-image-picker";
import {
  DateTimePicker,
  VmSpecFields,
  HostResourcesBar,
  ResourceWarnings,
} from "./event-form-fields";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function CreateEventDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const authz = useAuthz();
  const canReadHost = authz.hasPolicy(Policy.HOST_GET);
  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);

  const { data: hostInfo } = useHostInfo(canReadHost && open, 2000);
  const createEvent = useCreateEvent();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [selectedOS, setSelectedOS] = useState("");
  const [selectedDistribution, setSelectedDistribution] = useState("");
  const [vcpus, setVcpus] = useState("2");
  const [mem, setMem] = useState("4");
  const [diskSize, setDiskSize] = useState("20");
  const [maxVms, setMaxVms] = useState("10");
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);

  const vcpusNum = Number.parseInt(vcpus) || 0;
  const memNum = Number.parseInt(mem) || 0;
  const diskNum = Number.parseInt(diskSize) || 0;
  const maxVmsNum = Number.parseInt(maxVms) || 0;

  const isSlugValid =
    slug.length >= 2 && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug);
  const isFormValid =
    name.trim() !== "" &&
    isSlugValid &&
    selectedOS !== "" &&
    vcpusNum > 0 &&
    memNum > 0 &&
    diskNum > 0 &&
    maxVmsNum > 0 &&
    deadline !== undefined;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = async () => {
    if (!isFormValid || !deadline) return;

    try {
      await createEvent.mutateAsync({
        name: name.trim(),
        slug,
        vm_os: selectedOS,
        vm_distribution: selectedDistribution,
        vm_vcpus: vcpusNum,
        vm_mem: memNum,
        vm_disk_size: diskNum,
        max_vms: maxVmsNum,
        deadline: deadline.toISOString(),
      });

      setName("");
      setSlug("");
      setSlugManuallyEdited(false);
      setSelectedOS("");
      setSelectedDistribution("");
      setVcpus("2");
      setMem("4");
      setDiskSize("20");
      setMaxVms("10");
      setDeadline(undefined);
      onOpenChange(false);
    } catch {
      // Error shown in UI via createEvent.isError
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
          <DialogDescription>
            Set up a new event with VM specs, a participant limit, and a
            deadline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-name">Event Name</Label>
              <Input
                id="event-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Cloud Workshop"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-slug">
                URL Slug
                {slug && !isSlugValid && (
                  <span className="ml-2 text-xs text-destructive">
                    Min 2 chars, alphanumeric
                  </span>
                )}
              </Label>
              <Input
                id="event-slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="cloud-workshop"
                className={`font-mono ${slug && !isSlugValid ? "border-destructive" : ""}`}
              />
              {slug && isSlugValid && (
                <p className="text-xs text-muted-foreground">
                  Participants join at: /events/{slug}
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Operating System</Label>
            <VMImageSelect
              selectedOS={selectedOS}
              setSelectedOS={(os, distribution) => {
                setSelectedOS(os);
                setSelectedDistribution(distribution ?? "");
              }}
              enabled={canReadImages}
            />
          </div>

          <VmSpecFields
            vcpus={vcpus}
            onVcpusChange={setVcpus}
            mem={mem}
            onMemChange={setMem}
            diskSize={diskSize}
            onDiskChange={setDiskSize}
            maxCpus={hostInfo?.cpu.cpu_count}
          />

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-max-vms">Max Participants</Label>
              <Input
                id="event-max-vms"
                type="number"
                min="1"
                value={maxVms}
                onChange={(e) => setMaxVms(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <DateTimePicker value={deadline} onChange={setDeadline} />
            </div>
          </div>

          {hostInfo && <HostResourcesBar hostInfo={hostInfo} />}

          {hostInfo && (
            <ResourceWarnings
              vcpus={vcpusNum}
              mem={memNum}
              diskSize={diskNum}
              maxVms={maxVmsNum}
              hostInfo={hostInfo}
            />
          )}

          {createEvent.isError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                {createEvent.error instanceof Error
                  ? createEvent.error.message
                  : "Failed to create event"}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!isFormValid || createEvent.isPending}
            onClick={handleSubmit}
          >
            {createEvent.isPending ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Create Event
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
