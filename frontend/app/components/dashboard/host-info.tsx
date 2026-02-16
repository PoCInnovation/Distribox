import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import { useHostInfo } from "@/hooks/useHostInfo";
import type { HostInfo } from "@/lib/api";
import { formatGB } from "@/lib/utils";

function HostInfoCard({
  title,
  icon: Icon,
  iconColor,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div
          className={`flex h-10 w-10 items-center justify-center border border-border bg-secondary ${iconColor}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {children}
    </Card>
  );
}

function CPUInfo({ cpu }: { cpu: HostInfo["cpu"] }) {
  return (
    <HostInfoCard title="CPU Usage" icon={Cpu} iconColor="text-primary">
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">Total CPU Usage</span>
            <span className="font-mono text-sm font-bold">
              {cpu.percent_used_total.toFixed(1)}%
            </span>
          </div>
          <Progress value={cpu.percent_used_total} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">VMs CPU Usage</span>
            <span className="font-mono text-sm font-bold">
              {cpu.percent_used_total_vms.toFixed(1)}%
            </span>
          </div>
          <Progress value={cpu.percent_used_total_vms} />
        </div>

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">CPU Count</span>
            <span className="font-mono text-xs">{cpu.cpu_count} cores</span>
          </div>

          {cpu.percent_used_per_cpu.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="text-xs text-muted-foreground">
                Per Core Usage
              </span>
              <div className="grid grid-cols-2 gap-2">
                {cpu.percent_used_per_cpu.map((usage, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">Core {index}</span>
                      <span className="font-mono text-xs">
                        {usage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={usage} className="h-1" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {cpu.percent_used_per_vm.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="text-xs text-muted-foreground">
                Per VM Usage
              </span>
              <div className="space-y-1">
                {cpu.percent_used_per_vm.map((vmInfo, index) => (
                  <div
                    key={index}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    {vmInfo}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </HostInfoCard>
  );
}

function MemoryInfo({ mem }: { mem: HostInfo["mem"] }) {
  return (
    <HostInfoCard
      title="Memory Usage"
      icon={MemoryStick}
      iconColor="text-chart-2"
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">Used</span>
            <span className="font-mono text-sm font-bold">
              {mem.percent_used.toFixed(1)}%
            </span>
          </div>
          <Progress value={mem.percent_used} />
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-mono text-sm font-bold">{formatGB(mem.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Used</p>
            <p className="font-mono text-sm font-bold">{formatGB(mem.used)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="font-mono text-sm font-bold">
              {formatGB(mem.available)}
            </p>
          </div>
        </div>
      </div>
    </HostInfoCard>
  );
}

function DiskInfo({ disk }: { disk: HostInfo["disk"] }) {
  return (
    <HostInfoCard title="Disk Usage" icon={HardDrive} iconColor="text-chart-4">
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">Used</span>
            <span className="font-mono text-sm font-bold">
              {disk.percent_used.toFixed(1)}%
            </span>
          </div>
          <Progress value={disk.percent_used} />
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-mono text-sm font-bold">
              {formatGB(disk.total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Used</p>
            <p className="font-mono text-sm font-bold">{formatGB(disk.used)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="font-mono text-sm font-bold">
              {formatGB(disk.available)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Distribox Used</p>
            <p className="font-mono text-sm font-bold">
              {formatGB(disk.distribox_used)}
            </p>
          </div>
        </div>
      </div>
    </HostInfoCard>
  );
}

export function HostInfoPanel() {
  const { data: hostInfo, isLoading, isError, error } = useHostInfo();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border bg-card p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-24 bg-muted"></div>
              <div className="h-8 w-full bg-muted"></div>
              <div className="h-2 w-full bg-muted"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive bg-destructive/10 p-6">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-destructive" />
          <div>
            <h3 className="font-medium text-destructive">
              Failed to load host information
            </h3>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!hostInfo) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <CPUInfo cpu={hostInfo.cpu} />
      <MemoryInfo mem={hostInfo.mem} />
      <DiskInfo disk={hostInfo.disk} />
    </div>
  );
}
