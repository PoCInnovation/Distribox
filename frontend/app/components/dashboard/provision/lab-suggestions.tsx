import { useOsInfo } from "@/components/dashboard/vm-os-label";
import { getKeyboardLabel } from "@/lib/keyboard-layouts";
import type { Event } from "@/lib/types/event";
import { cn } from "@/lib/utils";
import type { VmSize } from "./model";

/**
 * What a new VM or event can reuse from a past event. Names, links,
 * deadlines, participants and credentials are never part of it.
 */
export interface LabConfig {
  os: string;
  distribution: string;
  size: VmSize;
  keyboard: string;
  ssh: boolean;
}

interface LabSuggestion extends LabConfig {
  key: string;
  name: string;
}

export function labConfigKey(config: Omit<LabConfig, "distribution">): string {
  const { os, size, keyboard, ssh } = config;
  return [os, size.vcpus, size.mem, size.disk, keyboard, ssh].join("|");
}

/** Distinct configurations of the newest events; the API lists newest first. */
export function labSuggestions(
  events: Event[] | undefined,
  limit = 4,
): LabSuggestion[] {
  const byKey = new Map<string, LabSuggestion>();
  for (const event of events ?? []) {
    if (byKey.size === limit) break;
    const config: LabConfig = {
      os: event.vm_os,
      distribution: event.vm_distribution,
      size: {
        vcpus: event.vm_vcpus,
        mem: event.vm_mem,
        disk: event.vm_disk_size,
      },
      keyboard: event.keyboard_layout ?? "",
      ssh: event.ssh_enabled,
    };
    const key = labConfigKey(config);
    if (!byKey.has(key)) byKey.set(key, { ...config, key, name: event.name });
  }
  return [...byKey.values()];
}

export function LabSuggestions({
  suggestions,
  activeKey,
  onPick,
}: {
  suggestions: LabSuggestion[];
  activeKey: string;
  onPick: (config: LabConfig) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Start from"
    >
      {suggestions.map((s) => (
        <SuggestionButton
          key={s.key}
          suggestion={s}
          active={s.key === activeKey}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function SuggestionButton({
  suggestion,
  active,
  onPick,
}: {
  suggestion: LabSuggestion;
  active: boolean;
  onPick: (config: LabConfig) => void;
}) {
  const os = useOsInfo(suggestion.os);
  const details = [
    os.label,
    suggestion.keyboard && getKeyboardLabel(suggestion.keyboard),
    suggestion.ssh && "SSH",
  ]
    .filter(Boolean)
    .join(", ");
  const { vcpus, mem, disk } = suggestion.size;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onPick(suggestion)}
      className={cn(
        "flex w-[13rem] flex-col items-start border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "border-primary bg-primary/10"
          : "border-border hover:border-foreground/30",
      )}
    >
      <span className="w-full truncate text-sm font-medium">
        {suggestion.name}
      </span>
      <span
        className="w-full truncate text-xs text-muted-foreground"
        title={details}
      >
        {details}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {vcpus} vCPU, {mem} GB, {disk} GB
      </span>
    </button>
  );
}
