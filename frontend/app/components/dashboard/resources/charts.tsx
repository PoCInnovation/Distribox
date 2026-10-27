import type { HostInfo } from "@/lib/types";
import { Sparkline, formatSize, percent, type Sample } from "./shared";

/** Three tiles: CPU and memory over the last minute, disk as a split bar. */
export function ResourcesCharts({
  hostInfo,
  history,
}: {
  hostInfo: HostInfo | undefined;
  history: Sample[];
}) {
  if (!hostInfo) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[150px] animate-pulse border border-border bg-card"
          />
        ))}
      </div>
    );
  }
  const { cpu, mem, disk } = hostInfo;
  const other = Math.max(0, disk.used - disk.distribox_used);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Tile
        label="CPU"
        value={percent(cpu.percent_used_total)}
        aside={`${cpu.cpu_count} cores`}
      >
        <Sparkline values={history.map((s) => s.cpu)} />
        <Footer
          left={`VMs ${percent(cpu.percent_used_total_vms)}`}
          right="last 60 s"
        />
      </Tile>

      <Tile
        label="Memory"
        value={percent(mem.percent_used)}
        aside={`${formatSize(mem.used)} / ${formatSize(mem.total)}`}
      >
        <Sparkline
          values={history.map((s) => s.mem)}
          strokeClassName="stroke-chart-2"
          fillClassName="fill-chart-2/15"
        />
        <Footer left={`${formatSize(mem.available)} free`} right="last 60 s" />
      </Tile>

      <Tile
        label="Disk"
        value={percent(disk.percent_used)}
        aside={`${formatSize(disk.used)} / ${formatSize(disk.total)}`}
      >
        <div className="flex h-16 flex-col justify-center">
          <div className="flex h-3 w-full bg-border/60">
            <div
              className="h-full bg-primary"
              style={{ width: `${(disk.distribox_used / disk.total) * 100}%` }}
            />
            <div
              className="h-full bg-muted-foreground/45"
              style={{ width: `${(other / disk.total) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Legend
              swatch="bg-primary"
              label="VMs and images"
              value={formatSize(disk.distribox_used)}
            />
            <Legend
              swatch="bg-muted-foreground/45"
              label="Other"
              value={formatSize(other)}
            />
            <Legend
              swatch="bg-border"
              label="Free"
              value={formatSize(disk.available)}
            />
          </div>
        </div>
      </Tile>
    </div>
  );
}

function Tile({
  label,
  value,
  aside,
  children,
}: {
  label: string;
  value: string;
  aside: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border border-border bg-card px-4 pt-3.5 pb-3">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-2xl leading-none tabular-nums">
          {value}
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
          {aside}
        </span>
      </div>
      {children}
    </div>
  );
}

function Legend({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 ${swatch}`} />
      {label}
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </span>
  );
}

function Footer({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
      <span>{left}</span>
      <span className="text-muted-foreground/60">{right}</span>
    </div>
  );
}
