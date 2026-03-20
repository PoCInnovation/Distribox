import { SlavesPage } from "@/components/dashboard/slaves-page";

export default function SlavesRoute() {
  return (
    <div className="h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Slaves
        </h1>
        <p className="text-muted-foreground">
          Manage slave nodes in your Distribox cluster. Slaves run VMs locally
          and report their status to this master node.
        </p>
      </div>
      <SlavesPage />
    </div>
  );
}
