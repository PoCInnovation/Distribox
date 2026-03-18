import type { ReactNode } from "react";
import {
  Calendar,
  Cpu,
  HardDrive,
  MemoryStick,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DistroLogo } from "@/components/distro-logo";

interface EventInfoCardProps {
  name: string;
  vmOs: string;
  vmDistribution?: string;
  vmVcpus: number;
  vmMem: number;
  vmDiskSize: number;
  participantsCount: number;
  maxVms: number;
  deadline: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventInfoCard({
  name,
  vmOs,
  vmDistribution,
  vmVcpus,
  vmMem,
  vmDiskSize,
  participantsCount,
  maxVms,
  deadline,
  description,
  children,
  className,
}: EventInfoCardProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>
      {/* Event header */}
      <div className="border-b border-border px-6 pt-3 pb-3 text-center">
        <h2 className="text-2xl font-bold">{name}</h2>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* VM specs */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 p-4",
          children && "border-b border-border",
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <DistroLogo
            distribution={vmDistribution || vmOs.replace(".qcow2", "")}
            className="h-5 w-5 rounded-sm bg-transparent"
          />
          {vmOs.replace(".qcow2", "")}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          {vmVcpus} vCPUs
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MemoryStick className="h-3.5 w-3.5 text-accent" />
          {vmMem} GB RAM
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5 text-chart-4" />
          {vmDiskSize} GB Disk
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {participantsCount}/{maxVms} joined
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDeadline(deadline)}
        </div>
      </div>

      {children}
    </div>
  );
}
