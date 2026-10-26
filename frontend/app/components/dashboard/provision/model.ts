import type { ClusterHostInfo, HostInfo, Slave, UserSettings } from "@/lib/types";

export interface VmSize {
  vcpus: number;
  mem: number;
  disk: number;
}

export type PresetKey = "small" | "medium" | "large";

export interface SizePreset extends VmSize {
  key: PresetKey;
  label: string;
  hint: string;
}

export const FALLBACK_SIZE: VmSize = { vcpus: 2, mem: 4, disk: 20 };

export const SIZE_LIMITS = {
  vcpus: { min: 1, max: 128, step: 1 },
  mem: { min: 1, max: 1024, step: 1 },
  disk: { min: 5, max: 10_000, step: 5 },
} as const;

export function sizeFromSettings(settings: UserSettings | undefined): VmSize {
  return {
    vcpus: settings?.default_vcpus || FALLBACK_SIZE.vcpus,
    mem: settings?.default_mem || FALLBACK_SIZE.mem,
    disk: settings?.default_disk_size || FALLBACK_SIZE.disk,
  };
}

/** Small / Medium / Large derived from the user's defaults (Medium = defaults). */
export function buildPresets(base: VmSize): SizePreset[] {
  const half = (n: number, min: number) => Math.max(min, Math.round(n / 2));
  return [
    {
      key: "small",
      label: "Small",
      hint: "half your default",
      vcpus: half(base.vcpus, SIZE_LIMITS.vcpus.min),
      mem: half(base.mem, SIZE_LIMITS.mem.min),
      disk: Math.max(SIZE_LIMITS.disk.min, Math.round(base.disk / 2 / 5) * 5),
    },
    { key: "medium", label: "Medium", hint: "your default", ...base },
    {
      key: "large",
      label: "Large",
      hint: "twice your default",
      vcpus: base.vcpus * 2,
      mem: base.mem * 2,
      disk: base.disk * 2,
    },
  ];
}

export function matchPreset(
  presets: SizePreset[],
  size: VmSize,
): PresetKey | "custom" {
  const hit = presets.find(
    (p) => p.vcpus === size.vcpus && p.mem === size.mem && p.disk === size.disk,
  );
  return hit ? hit.key : "custom";
}

export function clampSize(key: keyof VmSize, value: number): number {
  const { min, max } = SIZE_LIMITS[key];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** A node the VM could land on, with what is free right now. */
export interface NodeCapacity {
  /** null = master */
  id: string | null;
  name: string;
  cpuCount: number;
  memFree: number;
  memTotal: number;
  diskFree: number;
  diskTotal: number;
}

function freeOf(part: { total: number; used: number; available: number }) {
  return part.available > 0 ? part.available : Math.max(0, part.total - part.used);
}

export function nodeCapacityFromHostInfo(
  id: string | null,
  name: string,
  info: HostInfo,
): NodeCapacity {
  return {
    id,
    name,
    cpuCount: info.cpu.cpu_count,
    memFree: freeOf(info.mem),
    memTotal: info.mem.total,
    diskFree: freeOf(info.disk),
    diskTotal: info.disk.total,
  };
}

export function nodesFromCluster(cluster: ClusterHostInfo | undefined): NodeCapacity[] {
  if (!cluster) return [];
  return cluster.nodes.map((n) =>
    nodeCapacityFromHostInfo(n.node_id, n.node_name, n.host_info),
  );
}

export type FitProblem = "vcpus" | "mem" | "disk";

export interface NodeFit {
  node: NodeCapacity;
  problems: FitProblem[];
  fits: boolean;
}

export function fitOnNode(node: NodeCapacity, size: VmSize): NodeFit {
  const problems: FitProblem[] = [];
  if (size.vcpus > node.cpuCount) problems.push("vcpus");
  if (size.mem > node.memFree) problems.push("mem");
  if (size.disk > node.diskFree) problems.push("disk");
  return { node, problems, fits: problems.length === 0 };
}

export const PROBLEM_LABEL: Record<FitProblem, string> = {
  vcpus: "CPU",
  mem: "memory",
  disk: "disk",
};

export function describeProblems(problems: FitProblem[]): string {
  const labels = problems.map((p) => PROBLEM_LABEL[p]);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "auto" = let the master pick, null = master, string = slave id */
export type Placement = "auto" | null | string;

export function placementLabel(
  placement: Placement,
  slaves: Pick<Slave, "id" | "name">[],
): string {
  if (placement === "auto") return "Auto";
  if (placement === null) return "master";
  return slaves.find((s) => s.id === placement)?.name ?? "slave";
}

export function formatCapacity(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

export function titleOfImage(img: {
  name: string;
  distribution: string;
  version: string;
}): { title: string; subtitle: string } {
  const canonical = `${img.distribution} ${img.version}`.trim();
  const isCanonical =
    !img.name ||
    img.name.toLowerCase() === canonical.toLowerCase() ||
    img.name.toLowerCase() === img.distribution.toLowerCase();
  if (isCanonical) return { title: img.distribution, subtitle: img.version };
  return { title: img.name, subtitle: canonical };
}
