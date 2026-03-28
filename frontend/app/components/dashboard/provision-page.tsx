import { useState, useEffect } from "react";
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
  Pencil,
  Keyboard,
  CheckIcon,
  SearchIcon,
} from "lucide-react";
import { useTargetHostInfo } from "@/hooks/useHostInfo";
import { useCreateVM } from "@/hooks/useCreateVM";
import { useSlaves } from "@/hooks/useSlaves";
import {
  CompactCPUInfo,
  CompactMemoryInfo,
  CompactDiskInfo,
} from "@/components/dashboard/host-info";
import { useNavigate } from "react-router";
import { VMImageSelect } from "~/components/dashboard/vm-image-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Policy } from "@/lib/types";
import { useAuthz } from "@/contexts/authz-context";
import { PolicyGate } from "@/components/policy/policy-gate";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { useSettings } from "@/hooks/useSettings";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KEYBOARD_LAYOUTS, getKeyboardLabel } from "@/lib/keyboard-layouts";

export default function ProvisionPage() {
  const navigate = useNavigate();
  const authz = useAuthz();
  const hasCreatePolicy = authz.hasPolicy(Policy.VMS_CREATE);
  const canReadHost = authz.hasPolicy(Policy.HOST_GET);
  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);

  const [selectedSlaveId, setSelectedSlaveId] = useState<string | null>(null);
  const { data: hostInfo } = useTargetHostInfo(selectedSlaveId, canReadHost);
  const { data: userSettings } = useSettings();
  const createVM = useCreateVM();
  const { slaves } = useSlaves();
  const onlineSlaves = slaves.filter((s) => s.status === "online");

  const [name, setName] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [selectedOS, setSelectedOS] = useState("");
  const [vcpus, setVcpus] = useState("2");
  const [mem, setMem] = useState("4");
  const [diskSize, setDiskSize] = useState("20");
  const [keyboardLayout, setKeyboardLayout] = useState("");
  const [keyboardSearch, setKeyboardSearch] = useState("");

  useEffect(() => {
    if (userSettings) {
      if (userSettings.default_vcpus)
        setVcpus(userSettings.default_vcpus.toString());
      if (userSettings.default_mem) setMem(userSettings.default_mem.toString());
      if (userSettings.default_disk_size)
        setDiskSize(userSettings.default_disk_size.toString());
      if (userSettings.default_os) setSelectedOS(userSettings.default_os);
      if (userSettings.default_keyboard_layout)
        setKeyboardLayout(userSettings.default_keyboard_layout);
    }
  }, [userSettings]);

  const filteredKeyboards = KEYBOARD_LAYOUTS.filter((kb) =>
    kb.label.toLowerCase().includes(keyboardSearch.toLowerCase()),
  );

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
  const isNameEmpty = name.trim() === "";

  const isFormValid =
    !isNameEmpty &&
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
        name: name.trim(),
        vcpus: vcpusNum,
        mem: memNum,
        disk_size: diskNum,
        keyboard_layout: keyboardLayout || null,
        activate_at_start: autoStart,
        slave_id: selectedSlaveId || null,
      });

      // Navigate back to dashboard on success
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to provision VM:", error);
    }
  };

  if (!hasCreatePolicy) {
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
        <PolicyNotice
          title="Provisioning Hidden"
          missingPolicies={authz.missingPolicies([Policy.VMS_CREATE])}
        />
      </div>
    );
  }

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

      {onlineSlaves.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 font-mono text-lg font-bold">
            Target Host
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedSlaveId(null)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                selectedSlaveId === null
                  ? "border border-primary/40 bg-primary/10 text-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Server className="h-4 w-4" />
              <span>Master (local)</span>
              {selectedSlaveId === null && (
                <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
              )}
            </button>
            {onlineSlaves.map((slave) => (
              <button
                key={slave.id}
                type="button"
                onClick={() => setSelectedSlaveId(slave.id)}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                  selectedSlaveId === slave.id
                    ? "border border-primary/40 bg-primary/10 text-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Server className="h-4 w-4" />
                <span>{slave.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({slave.hostname}:{slave.port})
                </span>
                {selectedSlaveId === slave.id && (
                  <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <PolicyGate
        requiredPolicies={[Policy.HOST_GET]}
        title="Host Resources Hidden"
      >
        {hostInfo && (
          <div className="mb-8">
            <h2 className="mb-4 font-mono text-lg font-bold">
              Available Resources
              {selectedSlaveId && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  on {onlineSlaves.find((s) => s.id === selectedSlaveId)?.name ?? "slave"}
                </span>
              )}
              {!selectedSlaveId && onlineSlaves.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  on Master
                </span>
              )}
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <CompactCPUInfo cpu={hostInfo.cpu} />
              <CompactMemoryInfo mem={hostInfo.mem} />
              <CompactDiskInfo disk={hostInfo.disk} />
            </div>
          </div>
        )}
      </PolicyGate>

      <div className="grid gap-6 lg:grid-cols-3 pb-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Virtual Machine Name
              </CardTitle>
              <CardDescription>
                Give your virtual machine a unique and descriptive name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., my-dev-server"
                className={isNameEmpty ? "border-accent" : ""}
              />
              {isNameEmpty && (
                <div className="text-accent flex items-center gap-1 text-xs mt-2">
                  <AlertCircle className="h-3 w-3" />
                  Name is required
                </div>
              )}
            </CardContent>
          </Card>

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
            <CardContent className="w-full">
              <PolicyGate
                requiredPolicies={[Policy.IMAGES_GET]}
                title="Image Registry Hidden"
              >
                <VMImageSelect
                  selectedOS={selectedOS}
                  setSelectedOS={setSelectedOS}
                  enabled={canReadImages}
                />
              </PolicyGate>
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

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                Keyboard Layout
              </CardTitle>
              <CardDescription>
                Keyboard mapping for the VM console connection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
                  <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    placeholder="Search keyboard layouts..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    value={keyboardSearch}
                    onChange={(e) => setKeyboardSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-48">
                  <div className="space-y-0.5 p-1.5">
                    {filteredKeyboards.map((kb) => (
                      <button
                        key={kb.value}
                        type="button"
                        onClick={() => setKeyboardLayout(kb.value)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          keyboardLayout === kb.value
                            ? "border border-primary/40 bg-primary/10 text-foreground"
                            : "border border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <span>{kb.label}</span>
                        {keyboardLayout === kb.value && (
                          <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                    {filteredKeyboards.length === 0 && (
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                        No keyboard layouts match your search.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 sticky top-8 self-start">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Configuration Summary</CardTitle>
              <CardDescription>Review your VM configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">Name</span>
                  <span className="font-mono text-sm text-right max-w-[60%] break-words">
                    {name.trim() || "Not set"}
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">
                    OS Image
                  </span>
                  <span className="font-mono text-sm text-right max-w-[60%] break-words">
                    {selectedOS || "Not selected"}
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">
                    Keyboard
                  </span>
                  <span className="text-sm text-right max-w-[60%] break-words">
                    {keyboardLayout
                      ? getKeyboardLabel(keyboardLayout)
                      : "Default"}
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

              <div className="w-full flex flex-row items-center space-x-2">
                <Checkbox
                  checked={autoStart}
                  id="auto-start"
                  onCheckedChange={(checked) =>
                    setAutoStart(typeof checked === "boolean" ? checked : false)
                  }
                />
                <label
                  className="text-sm text-muted-foreground cursor-pointer"
                  htmlFor="auto-start"
                >
                  Automatically start after creation
                </label>
              </div>

              <Button
                className="w-full cursor-pointer"
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
