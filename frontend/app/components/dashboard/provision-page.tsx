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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Server, Cpu, HardDrive, Network, Check } from "lucide-react";

const osTemplates = [
  { id: "ubuntu-22", name: "Ubuntu 22.04 LTS", category: "Linux" },
  { id: "ubuntu-24", name: "Ubuntu 24.04 LTS", category: "Linux" },
  { id: "debian-12", name: "Debian 12", category: "Linux" },
  { id: "centos-9", name: "CentOS Stream 9", category: "Linux" },
  { id: "fedora-39", name: "Fedora 39", category: "Linux" },
  { id: "windows-2022", name: "Windows Server 2022", category: "Windows" },
  { id: "windows-2019", name: "Windows Server 2019", category: "Windows" },
];

const cpuOptions = [
  { value: "1", label: "1 vCPU", price: 5 },
  { value: "2", label: "2 vCPU", price: 10 },
  { value: "4", label: "4 vCPU", price: 20 },
  { value: "8", label: "8 vCPU", price: 40 },
  { value: "16", label: "16 vCPU", price: 80 },
];

const ramOptions = [
  { value: "2", label: "2 GB", price: 5 },
  { value: "4", label: "4 GB", price: 10 },
  { value: "8", label: "8 GB", price: 20 },
  { value: "16", label: "16 GB", price: 40 },
  { value: "32", label: "32 GB", price: 80 },
  { value: "64", label: "64 GB", price: 160 },
];

const diskOptions = [
  { value: "20", label: "20 GB SSD", price: 2 },
  { value: "40", label: "40 GB SSD", price: 4 },
  { value: "80", label: "80 GB SSD", price: 8 },
  { value: "160", label: "160 GB SSD", price: 16 },
  { value: "320", label: "320 GB SSD", price: 32 },
  { value: "500", label: "500 GB SSD", price: 50 },
];

export default function ProvisionPage() {
  const [vmName, setVmName] = useState("");
  const [selectedOS, setSelectedOS] = useState("");
  const [cpu, setCpu] = useState("2");
  const [ram, setRam] = useState("4");
  const [disk, setDisk] = useState("40");
  const [isProvisioning, setIsProvisioning] = useState(false);

  const handleProvision = async () => {
    setIsProvisioning(true);
    // Simulate provisioning
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("Provisioning VM:", { vmName, selectedOS, cpu, ram, disk });
    setIsProvisioning(false);
  };

  const isFormValid = vmName.trim() !== "" && selectedOS !== "";

  return (
    <div className="h-full p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight text-balance">
          Provision Virtual Machine
        </h1>
        <p className="text-muted-foreground">
          Configure and deploy a new virtual machine instance
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Configuration */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Basic Configuration
              </CardTitle>
              <CardDescription>
                Set up the basic details for your virtual machine
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vm-name">VM Name</Label>
                <Input
                  id="vm-name"
                  placeholder="e.g., prod-web-server-01"
                  value={vmName}
                  onChange={(e) => setVmName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Choose a descriptive name for your virtual machine
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="os-template">Operating System</Label>
                <Select value={selectedOS} onValueChange={setSelectedOS}>
                  <SelectTrigger id="os-template" className="w-40">
                    <SelectValue placeholder="Select an OS template" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Linux
                    </div>
                    {osTemplates
                      .filter((os) => os.category === "Linux")
                      .map((os) => (
                        <SelectItem key={os.id} value={os.id}>
                          {os.name}
                        </SelectItem>
                      ))}
                    <Separator className="my-1" />
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Windows
                    </div>
                    {osTemplates
                      .filter((os) => os.category === "Windows")
                      .map((os) => (
                        <SelectItem key={os.id} value={os.id}>
                          {os.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Resource Configuration */}
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
                <Label htmlFor="cpu">CPU</Label>
                <Select value={cpu} onValueChange={setCpu}>
                  <SelectTrigger id="cpu" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cpuOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ram">RAM</Label>
                <Select value={ram} onValueChange={setRam}>
                  <SelectTrigger id="ram" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ramOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disk">Storage</Label>
                <Select value={disk} onValueChange={setDisk}>
                  <SelectTrigger id="disk" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {diskOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-6">
          {/* Configuration Summary */}
          <Card className="border-border bg-card sticky top-8">
            <CardHeader>
              <CardTitle>Configuration Summary</CardTitle>
              <CardDescription>Review your VM configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">Name</span>
                  <span className="font-mono text-sm text-right">
                    {vmName || "Not set"}
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">OS</span>
                  <span className="text-sm text-right">
                    {selectedOS
                      ? osTemplates.find((os) => os.id === selectedOS)?.name
                      : "Not selected"}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span className="text-sm">CPU</span>
                  </div>
                  <span className="font-mono text-sm">
                    {cpuOptions.find((opt) => opt.value === cpu)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-chart-2" />
                    <span className="text-sm">RAM</span>
                  </div>
                  <span className="font-mono text-sm">
                    {ramOptions.find((opt) => opt.value === ram)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-chart-4" />
                    <span className="text-sm">Storage</span>
                  </div>
                  <span className="font-mono text-sm">
                    {diskOptions.find((opt) => opt.value === disk)?.label}
                  </span>
                </div>
              </div>

              <Separator />

              <Button
                className="w-full"
                disabled={!isFormValid || isProvisioning}
                onClick={handleProvision}
              >
                {isProvisioning ? (
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
            </CardContent>
          </Card>

          {/* Quick Tips */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Start small, scale up</p>
                <p className="text-xs text-muted-foreground">
                  You can always upgrade resources later as your needs grow
                </p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-sm font-medium">Use descriptive names</p>
                <p className="text-xs text-muted-foreground">
                  Include environment and purpose in VM names for easy
                  identification
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
