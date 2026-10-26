import { useState } from "react";
import {
  addDays,
  addHours,
  format,
  setHours,
  setMinutes,
  startOfMinute,
} from "date-fns";
import { CalendarIcon, CheckIcon, TriangleAlert } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { ClusterTotals } from "@/lib/types/host-info";
import { formatDuration } from "./events/event-model";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function roundToFive(date: Date): Date {
  const d = startOfMinute(date);
  return setMinutes(d, Math.ceil(d.getMinutes() / 5) * 5);
}

/** Quick picks for the usual shapes of an event: a lab, an evening, a week. */
function deadlinePresets(now: Date) {
  const tonight = setMinutes(setHours(now, 23), 55);
  return [
    { label: "In 3 hours", value: roundToFive(addHours(now, 3)) },
    ...(tonight.getTime() - now.getTime() > 3600_000
      ? [{ label: "Tonight", value: tonight }]
      : []),
    { label: "Tomorrow", value: setMinutes(setHours(addDays(now, 1), 18), 0) },
    { label: "In a week", value: setMinutes(setHours(addDays(now, 7), 23), 55) },
  ];
}

export function DateTimePicker({
  value,
  onChange,
  invalid = false,
  id,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const hours = value?.getHours() ?? 23;
    const minutes = value?.getMinutes() ?? 55;
    onChange(setMinutes(setHours(day, hours), minutes));
  };

  const timeButton = (active: boolean) =>
    cn(
      "flex w-11 items-center justify-center py-1.5 font-mono text-sm tabular-nums transition-colors hover:bg-secondary",
      active && "bg-primary/15 text-primary hover:bg-primary/20",
    );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            "flex h-10 w-full min-w-0 items-center gap-2.5 border bg-background px-3 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-none",
            invalid ? "border-destructive" : "border-input",
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="truncate font-mono tabular-nums">
              {format(value, "EEE d MMM yyyy, HH:mm")}
            </span>
          ) : (
            <span className="text-muted-foreground">Pick a date and time</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            disabled={(date) => date < setHours(new Date(), 0)}
          />
          <div className="border-l border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Time</p>
            <div className="flex gap-2">
              <div className="h-56 overflow-y-auto border border-border">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onChange(setHours(value ?? new Date(), h))}
                    className={timeButton(value?.getHours() === h)}
                  >
                    {h.toString().padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="h-56 overflow-y-auto border border-border">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange(setMinutes(value ?? new Date(), m))}
                    className={timeButton(value?.getMinutes() === m)}
                  >
                    {m.toString().padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Date/time picker with one-click presets and a "closes in" read-out. */
export function DeadlineField({
  value,
  onChange,
  invalid,
  id,
}: {
  value: Date | undefined;
  onChange: (date: Date) => void;
  invalid?: boolean;
  id?: string;
}) {
  const now = new Date();
  const presets = deadlinePresets(now);
  const left = value ? value.getTime() - now.getTime() : null;

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-muted-foreground"
      >
        Joining closes
      </label>
      <DateTimePicker
        id={id}
        value={value}
        onChange={(d) => d && onChange(d)}
        invalid={invalid}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = value?.getTime() === p.value.getTime();
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              className={cn(
                "h-7 border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <p
        className={cn(
          "mt-1.5 min-h-4 text-xs",
          left !== null && left <= 0 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {left === null
          ? "After this, the link stops handing out machines. Existing ones keep running."
          : left <= 0
            ? "This is in the past. Pick a later time."
            : `Closes in ${formatDuration(left)}. Existing machines keep running after that.`}
      </p>
    </div>
  );
}

/**
 * What the event costs if every seat is taken, against what the cluster has
 * free right now.
 */
export function FleetCapacity({
  seats,
  vcpus,
  mem,
  disk,
  totals,
  className,
}: {
  seats: number;
  vcpus: number;
  mem: number;
  disk: number;
  totals?: ClusterTotals;
  className?: string;
}) {
  const needMem = seats * mem;
  const needDisk = seats * disk;
  const problems: string[] = [];
  if (totals) {
    if (vcpus > totals.cpu_count)
      problems.push(`${vcpus} vCPU per VM, the cluster has ${totals.cpu_count} cores`);
    if (needMem > totals.mem_available)
      problems.push(`${needMem} GB memory, ${Math.floor(totals.mem_available)} GB free`);
    if (needDisk > totals.disk_available)
      problems.push(`${needDisk} GB disk, ${Math.floor(totals.disk_available)} GB free`);
  }

  return (
    <div className={cn("min-w-0 text-xs", className)}>
      <p className="truncate text-muted-foreground">
        With all {seats} seats taken:{" "}
        <span className="font-mono text-foreground tabular-nums">
          {seats * vcpus} vCPU, {needMem} GB memory, {needDisk} GB disk
        </span>
      </p>
      {totals &&
        (problems.length === 0 ? (
          <p className="mt-0.5 flex items-center gap-1 text-success">
            <CheckIcon className="size-3.5" />
            Fits in what the cluster has free
          </p>
        ) : (
          <p className="mt-0.5 flex items-start gap-1 text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span className="truncate" title={problems.join("; ")}>
              Short on room: {problems.join("; ")}
            </span>
          </p>
        ))}
    </div>
  );
}
