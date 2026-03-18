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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertCircle,
  CalendarIcon,
  Check,
  Cpu,
  HardDrive,
  MemoryStick,
  TriangleAlert,
} from "lucide-react";
import { format, setHours, setMinutes } from "date-fns";
import { useCreateEvent } from "@/hooks/useEvents";
import { useHostInfo } from "@/hooks/useHostInfo";
import { VMImageSelect } from "./vm-image-picker";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

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
  const [calendarOpen, setCalendarOpen] = useState(false);

  const vcpusNum = Number.parseInt(vcpus) || 0;
  const memNum = Number.parseInt(mem) || 0;
  const diskNum = Number.parseInt(diskSize) || 0;
  const maxVmsNum = Number.parseInt(maxVms) || 0;

  const totalCPUs = hostInfo?.cpu.cpu_count || 0;
  const availableMem = hostInfo?.mem.available || 0;
  const availableDisk = hostInfo?.disk.available || 0;

  const totalMemNeeded = maxVmsNum * memNum;
  const totalDiskNeeded = maxVmsNum * diskNum;
  const exceedsCpu = vcpusNum > totalCPUs && totalCPUs > 0;
  const exceedsMem = totalMemNeeded > availableMem && availableMem > 0;
  const exceedsDisk = totalDiskNeeded > availableDisk && availableDisk > 0;
  const exceedsResources = exceedsCpu || exceedsMem || exceedsDisk;

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

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) {
      setDeadline(undefined);
      return;
    }
    const hours = deadline?.getHours() ?? 23;
    const minutes = deadline?.getMinutes() ?? 59;
    setDeadline(setMinutes(setHours(day, hours), minutes));
  };

  const handleHourChange = (hour: number) => {
    const base = deadline ?? new Date();
    setDeadline(setHours(base, hour));
  };

  const handleMinuteChange = (minute: number) => {
    const base = deadline ?? new Date();
    setDeadline(setMinutes(base, minute));
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
        deadline: format(deadline, "yyyy-MM-dd'T'HH:mm:ss"),
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="event-vcpus" className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                vCPUs
              </Label>
              <Input
                id="event-vcpus"
                type="number"
                min="1"
                max={totalCPUs || undefined}
                value={vcpus}
                onChange={(e) => setVcpus(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-mem" className="flex items-center gap-2">
                <MemoryStick className="h-4 w-4 text-accent" />
                Memory (GB)
              </Label>
              <Input
                id="event-mem"
                type="number"
                min="1"
                value={mem}
                onChange={(e) => setMem(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-disk" className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-chart-4" />
                Disk (GB)
              </Label>
              <Input
                id="event-disk"
                type="number"
                min="1"
                value={diskSize}
                onChange={(e) => setDiskSize(e.target.value)}
              />
            </div>
          </div>

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
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !deadline && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline
                      ? format(deadline, "PPP 'at' HH:mm")
                      : "Pick a date and time"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" side="top">
                  <div className="flex">
                    <Calendar
                      mode="single"
                      selected={deadline}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < new Date()}
                    />
                    <div className="border-l p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Time
                      </p>
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground text-center">
                            HH
                          </span>
                          <div className="h-48 overflow-y-auto rounded-md border">
                            {HOURS.map((h) => (
                              <button
                                key={h}
                                type="button"
                                onClick={() => handleHourChange(h)}
                                className={cn(
                                  "flex w-10 items-center justify-center py-1.5 text-sm hover:bg-accent",
                                  deadline?.getHours() === h &&
                                    "bg-primary text-primary-foreground hover:bg-primary",
                                )}
                              >
                                {h.toString().padStart(2, "0")}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground text-center">
                            MM
                          </span>
                          <div className="h-48 overflow-y-auto rounded-md border">
                            {MINUTES.map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => handleMinuteChange(m)}
                                className={cn(
                                  "flex w-10 items-center justify-center py-1.5 text-sm hover:bg-accent",
                                  deadline?.getMinutes() === m &&
                                    "bg-primary text-primary-foreground hover:bg-primary",
                                )}
                              >
                                {m.toString().padStart(2, "0")}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {hostInfo && (
            <div className="rounded-md border bg-muted/50 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Host Resources
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                  <span>
                    <span className="font-medium">{totalCPUs}</span>{" "}
                    <span className="text-muted-foreground">cores</span>
                    <span className="ml-1 text-muted-foreground">
                      ({hostInfo.cpu.percent_used_total.toFixed(0)}% used)
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-3.5 w-3.5 text-accent" />
                  <span>
                    <span className="font-medium">
                      {availableMem.toFixed(1)}
                    </span>{" "}
                    <span className="text-muted-foreground">GB free</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 text-chart-4" />
                  <span>
                    <span className="font-medium">
                      {availableDisk.toFixed(1)}
                    </span>{" "}
                    <span className="text-muted-foreground">GB free</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {exceedsResources && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                {exceedsCpu && (
                  <p>
                    vCPUs per VM ({vcpusNum}) exceeds host cores ({totalCPUs}).
                  </p>
                )}
                {exceedsMem && (
                  <p>
                    Total RAM needed ({totalMemNeeded} GB ={" "}
                    {maxVmsNum} VMs &times; {memNum} GB) exceeds available (
                    {availableMem.toFixed(1)} GB).
                  </p>
                )}
                {exceedsDisk && (
                  <p>
                    Total disk needed ({totalDiskNeeded} GB ={" "}
                    {maxVmsNum} VMs &times; {diskNum} GB) exceeds available (
                    {availableDisk.toFixed(1)} GB).
                  </p>
                )}
              </div>
            </div>
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
