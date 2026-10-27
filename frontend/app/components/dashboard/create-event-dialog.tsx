import { EventFormDialog } from "./events/event-form-dialog";

export function CreateEventDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <EventFormDialog open={open} onOpenChange={onOpenChange} />;
}
