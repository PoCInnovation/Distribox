import { SlavesPage } from "@/components/dashboard/slaves-page";

export default function SlavesRoute() {
  return (
    <div className="h-full p-8">
      <div className="mb-6">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Slaves
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Slaves run VMs on their own hardware and report to this master every
          30 seconds.
        </p>
      </div>
      <SlavesPage />
    </div>
  );
}
