import { EventsPage } from "@/components/dashboard/events-page";

export default function EventsRoute() {
  return (
    <div className="h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Events
        </h1>
        <p className="text-muted-foreground">
          An Event allows you to easily distribute a fixed number of VMs with a
          predefined specification for a set duration.
        </p>
      </div>
      <EventsPage />
    </div>
  );
}
