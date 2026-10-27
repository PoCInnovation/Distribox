import { Link } from "react-router";
import type { HostInfo } from "@/lib/types";
import { CoreBars, Meter, percent } from "./shared";

/** Per-core load on the left, the VMs causing it on the right. */
export function ResourcesDetails({
  hostInfo,
  topVms,
  running,
}: {
  hostInfo: HostInfo;
  topVms: { id: string; name: string; percent: number }[];
  running: number;
}) {
  const top = topVms[0]?.percent ?? 0;

  return (
    <div className="grid border border-border bg-card lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col px-4 py-3.5">
        <p className="mb-3 text-xs text-muted-foreground">Per core</p>
        <CoreBars
          cores={hostInfo.cpu.percent_used_per_cpu}
          className="h-auto min-h-16 flex-1"
        />
      </div>

      <div className="border-t border-border px-4 py-3.5 lg:border-t-0 lg:border-l">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Top VMs by CPU</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {running} running
          </span>
        </div>
        {topVms.length === 0 ? (
          <p className="text-xs text-muted-foreground">No running VMs</p>
        ) : (
          <ul className="space-y-2">
            {topVms.map((vm) => (
              <li
                key={vm.id}
                className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 font-mono text-xs"
              >
                <Link
                  to={`?vm=${vm.id}`}
                  className="truncate hover:text-primary"
                >
                  {vm.name}
                </Link>
                <Meter
                  label={`${vm.name} CPU`}
                  percent={top ? (vm.percent / top) * 100 : 0}
                  className="[&>div]:bg-primary"
                />
                <span className="text-right text-muted-foreground tabular-nums">
                  {percent(vm.percent)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
