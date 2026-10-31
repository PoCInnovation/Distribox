import { ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getKeyboardLabel } from "@/lib/keyboard-layouts";
import type { Event } from "@/lib/types/event";
import type { VmSize } from "./model";

/**
 * What a new VM or event reuses from a past event. Names, links,
 * deadlines, participants and credentials are never part of it.
 */
export function labConfigOf(event: Event) {
  const size: VmSize = {
    vcpus: event.vm_vcpus,
    mem: event.vm_mem,
    disk: event.vm_disk_size,
  };
  return {
    os: event.vm_os,
    distribution: event.vm_distribution,
    size,
    keyboard: event.keyboard_layout ?? "",
    ssh: event.ssh_enabled,
    seats: event.max_vms,
  };
}

/** Lists the newest events; the API returns them newest first. */
export function CopyFromMenu({
  events,
  onPick,
}: {
  events: Event[] | undefined;
  onPick: (event: Event) => void;
}) {
  const recent = (events ?? []).slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Copy className="size-3.5" />
          Copy from
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Past events
        </DropdownMenuLabel>
        {recent.map((event) => (
          <DropdownMenuItem
            key={event.id}
            onSelect={() => onPick(event)}
            className="flex-col items-start gap-0.5"
          >
            <span className="w-full truncate text-sm font-medium">
              {event.name}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {[
                `${event.vm_vcpus} vCPU, ${event.vm_mem} GB, ${event.vm_disk_size} GB`,
                event.keyboard_layout &&
                  getKeyboardLabel(event.keyboard_layout).split(" - ").pop(),
                event.ssh_enabled && "SSH",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
