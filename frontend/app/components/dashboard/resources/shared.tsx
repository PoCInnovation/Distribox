import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getVMs } from "@/lib/api";
import type { HostInfo, VirtualMachineMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";

export type NodeOption = { id: string | null; name: string };

/** Master plus online slaves, as a segmented control. Hidden with one node. */
export function NodeSwitch({
  nodes,
  value,
  onChange,
  className,
}: {
  nodes: NodeOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  if (nodes.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Host"
      className={cn(
        "flex h-8 w-fit items-stretch border border-border text-sm",
        className,
      )}
    >
      {nodes.map((node) => (
        <button
          key={node.id ?? "master"}
          type="button"
          role="radio"
          aria-checked={value === node.id}
          onClick={() => onChange(node.id)}
          className={cn(
            "px-3 font-mono transition-colors not-first:border-l not-first:border-border",
            value === node.id
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          {node.name}
        </button>
      ))}
    </div>
  );
}

export function loadTone(percent: number) {
  return percent >= 95
    ? "bg-destructive"
    : percent >= 80
      ? "bg-warning"
      : "bg-primary";
}

/** Thin usage bar. An optional `inner` share is drawn darker inside it. */
export function Meter({
  percent,
  inner,
  className,
  label,
}: {
  percent: number;
  inner?: number;
  className?: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("relative h-1 w-full bg-border/60", className)}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 transition-[width] duration-500",
          loadTone(pct),
        )}
        style={{ width: `${pct}%` }}
      />
      {inner !== undefined && (
        <div
          className="absolute inset-y-0 left-0 bg-black/45 transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(pct, inner))}%` }}
        />
      )}
    </div>
  );
}

export function formatSize(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(gb >= 10_000 ? 0 : 1)} TB`;
  return `${gb >= 100 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export type Sample = { cpu: number; mem: number };

/** Last `size` samples for one node; starts over when the node changes. */
export function useHistory(
  hostInfo: HostInfo | undefined,
  nodeKey: string,
  size = 60,
) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const key = useRef(nodeKey);

  useEffect(() => {
    if (key.current !== nodeKey) {
      key.current = nodeKey;
      setSamples([]);
    }
  }, [nodeKey]);

  useEffect(() => {
    if (!hostInfo) return;
    setSamples((prev) =>
      [
        ...prev,
        {
          cpu: hostInfo.cpu.percent_used_total,
          mem: hostInfo.mem.percent_used,
        },
      ].slice(-size),
    );
  }, [hostInfo, size]);

  return samples;
}

/** VMs on one node (null = master), from the shared VM list query. */
export function useNodeVms(nodeId: string | null) {
  const { data } = useQuery<VirtualMachineMetadata[]>({
    queryKey: ["vms"],
    queryFn: getVMs,
    retry: false,
  });
  return useMemo(() => {
    const vms = (data ?? []).filter((vm) => (vm.slave_id ?? null) === nodeId);
    return {
      vms,
      running: vms.filter((vm) => vm.state === "Running").length,
    };
  }, [data, nodeId]);
}

/** "uuid: 12.5%" strings from the backend, joined to VM names. */
export function useTopVms(
  hostInfo: HostInfo | undefined,
  vms: VirtualMachineMetadata[],
  limit = 5,
) {
  return useMemo(() => {
    const byId = new Map(vms.map((vm) => [vm.id, vm]));
    return (hostInfo?.cpu.percent_used_per_vm ?? [])
      .map((entry) => {
        const [id, value] = entry.split(":");
        const vm = byId.get(id.trim());
        return {
          id: id.trim(),
          name: vm?.name ?? id.trim().slice(0, 8),
          percent: Number.parseFloat(value) || 0,
        };
      })
      .sort((a, b) => b.percent - a.percent)
      .slice(0, limit);
  }, [hostInfo, vms, limit]);
}

/** Area sparkline over a fixed 0–100 scale. */
export function Sparkline({
  values,
  size = 60,
  className,
  strokeClassName = "stroke-primary",
  fillClassName = "fill-primary/15",
}: {
  values: number[];
  size?: number;
  className?: string;
  strokeClassName?: string;
  fillClassName?: string;
}) {
  const w = 300;
  const h = 64;
  if (values.length < 2) {
    return <div className={cn("h-16 w-full", className)} />;
  }
  const step = w / (size - 1);
  const offset = (size - values.length) * step;
  const points = values.map((v, i) => [
    offset + i * step,
    h - (Math.max(0, Math.min(100, v)) / 100) * (h - 2) - 1,
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  const area = `M${points[0][0].toFixed(1)},${h} L${line.join(" L")} L${w},${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-16 w-full", className)}
      aria-hidden
    >
      {[25, 50, 75].map((g) => (
        <line
          key={g}
          x1={0}
          x2={w}
          y1={h - (g / 100) * h}
          y2={h - (g / 100) * h}
          className="stroke-border/60"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={area} className={fillClassName} />
      <polyline
        points={line.join(" ")}
        fill="none"
        className={strokeClassName}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** One bar per core, height = load. */
export function CoreBars({
  cores,
  className,
}: {
  cores: number[];
  className?: string;
}) {
  return (
    <div className={cn("flex h-10 items-end gap-0.5", className)}>
      {cores.map((load, i) => (
        <div
          key={i}
          title={`Core ${i}: ${percent(load)}`}
          className="relative h-full min-w-0 flex-1 bg-border/50"
        >
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 transition-[height] duration-500",
              loadTone(load),
            )}
            style={{ height: `${Math.max(2, Math.min(100, load))}%` }}
          />
        </div>
      ))}
    </div>
  );
}
