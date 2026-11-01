import type { Event } from "@/lib/types/event";
import { EventFormDialog } from "./events/event-form-dialog";

export function CreateEventDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: Event;
}) {
  return (
    <EventFormDialog open={open} onOpenChange={onOpenChange} source={source} />
  );
}
