import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HostInfo } from "@/lib/api";
import { formatGB } from "@/lib/utils";

function CompactCard({
  title,
  icon: Icon,
  iconColor,
  subtitle,
  percentage,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  subtitle?: string;
  percentage: number;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={`border-border bg-card overflow-hidden w-full ${!isExpanded ? "h-fit" : ""}`}
    >
      <Button
        variant="ghost"
        className="w-full p-4 h-auto flex items-center justify-between hover:bg-secondary/50 rounded-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1">
          <div
            className={`flex h-8 w-8 items-center justify-center border border-border bg-secondary ${iconColor}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{title}</span>
              <span className="font-mono text-sm font-bold">
                {percentage.toFixed(1)}%
              </span>
            </div>
            <Progress value={percentage} className="h-1.5" />
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </Button>
      {isExpanded && children && (
        <div className="border-t border-border p-4 bg-secondary/20">
          {children}
        </div>
      )}
    </Card>
  );
}

export function CompactCPUInfo({ cpu }: { cpu: HostInfo["cpu"] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <CompactCard
      title="CPU Usage"
      icon={Cpu}
      iconColor="text-primary"
      percentage={cpu.percent_used_total}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      subtitle={`${cpu.cpu_count} Cores`}
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">VMs CPU Usage</span>
            <span className="font-mono text-sm font-bold">
              {cpu.percent_used_total_vms.toFixed(1)}%
            </span>
          </div>
          <Progress value={cpu.percent_used_total_vms} />
        </div>

        {cpu.percent_used_per_cpu.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
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
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
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
    </CompactCard>
  );
}

export function CompactMemoryInfo({ mem }: { mem: HostInfo["mem"] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <CompactCard
      title="Memory Usage"
      icon={MemoryStick}
      iconColor="text-chart-2"
      subtitle={`${formatGB(mem.used)} of ${formatGB(mem.total)}`}
      percentage={mem.percent_used}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
    >
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-mono text-sm font-bold">
            {formatGB(mem.total)}
          </p>
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
    </CompactCard>
  );
}

export function CompactDiskInfo({ disk }: { disk: HostInfo["disk"] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <CompactCard
      title="Disk Usage"
      icon={HardDrive}
      iconColor="text-chart-4"
      subtitle={`${formatGB(disk.used)} of ${formatGB(disk.total)}`}
      percentage={disk.percent_used}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-mono text-sm font-bold">
            {formatGB(disk.total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Used</p>
          <p className="font-mono text-sm font-bold">
            {formatGB(disk.used)}
          </p>
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
    </CompactCard>
  );
}
