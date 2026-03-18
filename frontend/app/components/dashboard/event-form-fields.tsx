import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarIcon,
  Cpu,
  HardDrive,
  MemoryStick,
  TriangleAlert,
} from "lucide-react";
import { format, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import type { HostInfo } from "@/lib/types/host-info";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export function DateTimePicker({
  value,
  onChange,
  side = "top",
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const hours = value?.getHours() ?? 23;
    const minutes = value?.getMinutes() ?? 59;
    onChange(setMinutes(setHours(day, hours), minutes));
  };

  const handleHourChange = (hour: number) => {
    const base = value ?? new Date();
    onChange(setHours(base, hour));
  };

  const handleMinuteChange = (minute: number) => {
    const base = value ?? new Date();
    onChange(setMinutes(base, minute));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP 'at' HH:mm") : "Pick a date and time"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side={side}>
        <div className="flex">
          <Calendar
            mode="single"
            selected={value}
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
                        value?.getHours() === h &&
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
                        value?.getMinutes() === m &&
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
  );
}

export function VmSpecFields({
  vcpus,
  onVcpusChange,
  mem,
  onMemChange,
  diskSize,
  onDiskChange,
  maxCpus,
}: {
  vcpus: string;
  onVcpusChange: (value: string) => void;
  mem: string;
  onMemChange: (value: string) => void;
  diskSize: string;
  onDiskChange: (value: string) => void;
  maxCpus?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          vCPUs
        </Label>
        <Input
          type="number"
          min="1"
          max={maxCpus || undefined}
          value={vcpus}
          onChange={(e) => onVcpusChange(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MemoryStick className="h-4 w-4 text-accent" />
          Memory (GB)
        </Label>
        <Input
          type="number"
          min="1"
          value={mem}
          onChange={(e) => onMemChange(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-chart-4" />
          Disk (GB)
        </Label>
        <Input
          type="number"
          min="1"
          value={diskSize}
          onChange={(e) => onDiskChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export function HostResourcesBar({ hostInfo }: { hostInfo: HostInfo }) {
  return (
    <div className="rounded-md border bg-muted/50 px-4 py-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Host Resources
      </p>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span>
            <span className="font-medium">{hostInfo.cpu.cpu_count}</span>{" "}
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
              {hostInfo.mem.available.toFixed(1)}
            </span>{" "}
            <span className="text-muted-foreground">GB free</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 text-chart-4" />
          <span>
            <span className="font-medium">
              {hostInfo.disk.available.toFixed(1)}
            </span>{" "}
            <span className="text-muted-foreground">GB free</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function ResourceWarnings({
  vcpus,
  mem,
  diskSize,
  maxVms,
  hostInfo,
}: {
  vcpus: number;
  mem: number;
  diskSize: number;
  maxVms: number;
  hostInfo: HostInfo;
}) {
  const totalCPUs = hostInfo.cpu.cpu_count;
  const availableMem = hostInfo.mem.available;
  const availableDisk = hostInfo.disk.available;

  const totalMemNeeded = maxVms * mem;
  const totalDiskNeeded = maxVms * diskSize;
  const exceedsCpu = vcpus > totalCPUs;
  const exceedsMem = totalMemNeeded > availableMem;
  const exceedsDisk = totalDiskNeeded > availableDisk;

  if (!exceedsCpu && !exceedsMem && !exceedsDisk) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
      <div className="text-sm text-yellow-700 dark:text-yellow-300">
        {exceedsCpu && (
          <p>
            vCPUs per VM ({vcpus}) exceeds host cores ({totalCPUs}).
          </p>
        )}
        {exceedsMem && (
          <p>
            Total RAM needed ({totalMemNeeded} GB = {maxVms} VMs &times; {mem}{" "}
            GB) exceeds available ({availableMem.toFixed(1)} GB).
          </p>
        )}
        {exceedsDisk && (
          <p>
            Total disk needed ({totalDiskNeeded} GB = {maxVms} VMs &times;{" "}
            {diskSize} GB) exceeds available ({availableDisk.toFixed(1)} GB).
          </p>
        )}
      </div>
    </div>
  );
}
