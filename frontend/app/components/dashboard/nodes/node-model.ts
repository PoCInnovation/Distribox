import type { Slave } from "@/lib/types/slave";
import type { ClusterHostInfo, HostInfo } from "@/lib/types";
import type { VirtualMachineMetadata } from "@/lib/types/virtual-machine";
import { API_BASE_URL } from "@/lib/api/core";

export type NodeStatus = "online" | "offline" | "maintenance";

export interface Capacity {
  /** Absolute total in the unit (vCPUs or GB). */
  total: number;
  /** Absolute used in the unit. */
  used: number;
  /** 0..100 */
  percent: number;
  /** false when the figure comes from the last known slave report rather than live host info. */
  live: boolean;
}

export interface ClusterNode {
  /** `null` for the master. */
  id: string | null;
  name: string;
  role: "master" | "slave";
  status: NodeStatus;
  /** "host:port" for slaves, the API origin for the master. */
  address: string;
  lastHeartbeat: string | null;
  registeredAt: string | null;
  apiKey: string | null;
  cpu: Capacity | null;
  mem: Capacity | null;
  disk: Capacity | null;
  /** Only known when the VM list is readable. */
  vms: VirtualMachineMetadata[] | null;
  raw: Slave | null;
}

function toStatus(status: string): NodeStatus {
  if (status === "online" || status === "maintenance") return status;
  return "offline";
}

function fromHostInfo(info: HostInfo): {
  cpu: Capacity;
  mem: Capacity;
  disk: Capacity;
} {
  const cpuPercent = Math.max(0, Math.min(100, info.cpu.percent_used_total));
  return {
    cpu: {
      total: info.cpu.cpu_count,
      used: Math.round((info.cpu.cpu_count * cpuPercent) / 100),
      percent: cpuPercent,
      live: true,
    },
    mem: {
      total: info.mem.total,
      used: info.mem.used,
      percent: info.mem.percent_used,
      live: true,
    },
    disk: {
      total: info.disk.total,
      used: info.disk.used,
      percent: info.disk.percent_used,
      live: true,
    },
  };
}

function fromSlaveReport(
  total: number,
  availablePercent: number,
): Capacity | null {
  if (!total) return null;
  const percent = Math.max(0, Math.min(100, 100 - availablePercent));
  return {
    total,
    used: Math.round((total * percent) / 100),
    percent,
    live: false,
  };
}

export function masterAddress(): string {
  try {
    const url = new URL(API_BASE_URL);
    return url.host;
  } catch {
    return API_BASE_URL;
  }
}

export function buildClusterNodes({
  slaves,
  cluster,
  vms,
}: {
  slaves: Slave[];
  cluster: ClusterHostInfo | undefined;
  vms: VirtualMachineMetadata[] | undefined;
}): ClusterNode[] {
  const masterInfo = cluster?.nodes.find((n) => n.node_id === null)?.host_info;
  const masterCaps = masterInfo ? fromHostInfo(masterInfo) : null;

  const master: ClusterNode = {
    id: null,
    name: cluster?.nodes.find((n) => n.node_id === null)?.node_name ?? "master",
    role: "master",
    status: "online",
    address: masterAddress(),
    lastHeartbeat: null,
    registeredAt: null,
    apiKey: null,
    cpu: masterCaps?.cpu ?? null,
    mem: masterCaps?.mem ?? null,
    disk: masterCaps?.disk ?? null,
    vms: vms ? vms.filter((vm) => !vm.slave_id) : null,
    raw: null,
  };

  const slaveNodes: ClusterNode[] = slaves.map((slave) => {
    const live = cluster?.nodes.find((n) => n.node_id === slave.id)?.host_info;
    const caps = live ? fromHostInfo(live) : null;
    return {
      id: slave.id,
      name: slave.name,
      role: "slave",
      status: toStatus(slave.status),
      address: `${slave.hostname}:${slave.port}`,
      lastHeartbeat: slave.last_heartbeat,
      registeredAt: slave.created_at,
      apiKey: slave.api_key,
      cpu: caps?.cpu ?? fromSlaveReport(slave.total_cpu, slave.available_cpu),
      mem: caps?.mem ?? fromSlaveReport(slave.total_mem, slave.available_mem),
      disk:
        caps?.disk ?? fromSlaveReport(slave.total_disk, slave.available_disk),
      vms: vms ? vms.filter((vm) => vm.slave_id === slave.id) : null,
      raw: slave,
    };
  });

  // Online first, then offline, then maintenance; stable by name within a group.
  const order: Record<NodeStatus, number> = {
    online: 0,
    maintenance: 1,
    offline: 2,
  };
  slaveNodes.sort(
    (a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name),
  );

  return [master, ...slaveNodes];
}

export function formatGb(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(gb >= 10_000 ? 0 : 1)} TB`;
  return `${Math.round(gb)} GB`;
}
