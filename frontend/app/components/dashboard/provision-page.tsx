import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Check,
  AlertCircle,
} from "lucide-react";
import { useHostInfo } from "@/hooks/useHostInfo";
import { useCreateVM } from "@/hooks/useCreateVM";
import {
  CompactCPUInfo,
  CompactMemoryInfo,
  CompactDiskInfo,
} from "@/components/dashboard/compact-host-info";
import { useNavigate } from "react-router";
import { VMImageSelect } from "@/components/dashboard/vm-image-select";

export default function ProvisionPage() {
  const navigate = useNavigate();
  const { data: hostInfo } = useHostInfo();
  const createVM = useCreateVM();

  const [selectedOS, setSelectedOS] = useState("");
  const [vcpus, setVcpus] = useState("2");
  const [mem, setMem] = useState("4");
  const [diskSize, setDiskSize] = useState("20");

  const vcpusNum = Number.parseInt(vcpus) || 0;
  const memNum = Number.parseInt(mem) || 0;
  const diskNum = Number.parseInt(diskSize) || 0;

  // Calculate available resources (in GB)
  // Backend returns values already in GB
  const availableMemGB = hostInfo
    ? hostInfo.mem.available > 0
      ? hostInfo.mem.available
      : hostInfo.mem.total - hostInfo.mem.used
    : 0;

  const availableDiskGB = hostInfo
    ? hostInfo.disk.available > 0
      ? hostInfo.disk.available
      : hostInfo.disk.total - hostInfo.disk.used
    : 0;

  const totalCPUs = hostInfo?.cpu.cpu_count || 0;

  // Validation
  const memExceedsAvailable = memNum > availableMemGB;
  const diskExceedsAvailable = diskNum > availableDiskGB;
  const cpuExceedsAvailable = vcpusNum > totalCPUs;

  const isFormValid =
    selectedOS !== "" &&
    vcpusNum > 0 &&
    memNum > 0 &&
    diskNum > 0 &&
    !memExceedsAvailable &&
    !diskExceedsAvailable &&
    !cpuExceedsAvailable;

  const handleProvision = async () => {
    if (!isFormValid) return;

    try {
      await createVM.mutateAsync({
        os: selectedOS,
        vcpus: vcpusNum,
        mem: memNum,
        disk_size: diskNum,
      });

      // Navigate back to dashboard on success
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to provision VM:", error);
    }
  };

  return (
    <div className="h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Provision Virtual Machine
        </h1>
        <p className="text-muted-foreground">
          Configure and deploy a new virtual machine instance
        </p>
      </div>

      {hostInfo && (
        <div className="mb-8">
          <h2 className="mb-4 font-mono text-lg font-bold">
            Available Resources
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <CompactCPUInfo cpu={hostInfo.cpu} />
            <CompactMemoryInfo mem={hostInfo.mem} />
            <CompactDiskInfo disk={hostInfo.disk} />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 pb-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Operating System
              </CardTitle>
              <CardDescription>
                Select the base image for your virtual machine
              </CardDescription>
            </CardHeader>
            <CardContent className="w-full flex justify-center">
              <VMImageSelect selectedOS={selectedOS} setSelectedOS={setSelectedOS} />
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Resource Configuration
              </CardTitle>
              <CardDescription>
                Allocate compute, memory, and storage resources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="vcpus" className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Virtual CPUs
                </Label>
                <Input
                  id="vcpus"
                  type="number"
                  min="1"
                  max={totalCPUs}
                  value={vcpus}
                  onChange={(e) => setVcpus(e.target.value)}
                  className={cpuExceedsAvailable ? "border-accent" : ""}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Available: {totalCPUs} cores
                  </span>
                  {cpuExceedsAvailable && (
                    <span className="text-accent flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Exceeds available CPUs
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mem" className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" />
                  Memory (GB)
                </Label>
                <Input
                  id="mem"
                  type="number"
                  min="1"
                  value={mem}
                  onChange={(e) => setMem(e.target.value)}
                  className={memExceedsAvailable ? "border-accent" : ""}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Available: {availableMemGB.toFixed(2)} GB
                  </span>
                  {memExceedsAvailable && (
                    <span className="text-accent flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Exceeds available memory
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disk" className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Disk Size (GB)
                </Label>
                <Input
                  id="disk"
                  type="number"
                  min="1"
                  value={diskSize}
                  onChange={(e) => setDiskSize(e.target.value)}
                  className={diskExceedsAvailable ? "border-accent" : ""}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Available: {availableDiskGB.toFixed(2)} GB
                  </span>
                  {diskExceedsAvailable && (
                    <span className="text-accent flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Exceeds available disk space
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border bg-card sticky top-8">
            <CardHeader>
              <CardTitle>Configuration Summary</CardTitle>
              <CardDescription>Review your VM configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">
                    OS Image
                  </span>
                  <span className="font-mono text-sm text-right max-w-[60%] break-words">
                    {selectedOS || "Not selected"}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span className="text-sm">vCPUs</span>
                  </div>
                  <span className="font-mono text-sm">
                    {vcpusNum > 0 ? vcpusNum : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MemoryStick className="h-4 w-4 text-chart-2" />
                    <span className="text-sm">Memory</span>
                  </div>
                  <span className="font-mono text-sm">
                    {memNum > 0 ? `${memNum} GB` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-chart-4" />
                    <span className="text-sm">Disk</span>
                  </div>
                  <span className="font-mono text-sm">
                    {diskNum > 0 ? `${diskNum} GB` : "-"}
                  </span>
                </div>
              </div>

              <Separator />

              {(memExceedsAvailable ||
                diskExceedsAvailable ||
                cpuExceedsAvailable) && (
                <>
                  <div className="rounded-md bg-accent/10 border border-accent p-3">
                    <p className="text-sm text-accent font-medium">
                      Resource limits exceeded
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Please adjust your configuration to fit within available
                      resources
                    </p>
                  </div>
                  <Separator />
                </>
              )}

              <Button
                className="w-full"
                disabled={!isFormValid || createVM.isPending}
                onClick={handleProvision}
              >
                {createVM.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Provisioning...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Provision VM
                  </>
                )}
              </Button>

              {createVM.isError && (
                <div className="rounded-md bg-accent/10 border border-accent p-3">
                  <p className="text-sm text-accent font-medium">
                    Failed to provision VM
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {createVM.error instanceof Error
                      ? createVM.error.message
                      : "Unknown error occurred"}
                  </p>
                </div>
              )}

              {createVM.isSuccess && (
                <div className="rounded-md bg-chart-3/10 border border-chart-3 p-3">
                  <p className="text-sm text-chart-3 font-medium">
                    VM provisioned successfully!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Redirecting to dashboard...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Resource Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Start conservative</p>
                <p className="text-xs text-muted-foreground">
                  Allocate only what you need initially. You can always adjust
                  later.
                </p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-sm font-medium">Leave headroom</p>
                <p className="text-xs text-muted-foreground">
                  Don't allocate all available resources - leave some for the
                  host system.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
