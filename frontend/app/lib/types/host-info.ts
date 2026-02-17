export interface HostInfo {
  disk: {
    total: number;
    used: number;
    available: number;
    percent_used: number;
    distribox_used: number;
  };
  mem: {
    total: number;
    used: number;
    available: number;
    percent_used: number;
  };
  cpu: {
    percent_used_total: number;
    percent_used_per_cpu: number[];
    percent_used_per_vm: string[];
    percent_used_total_vms: number;
    cpu_count: number;
  };
}
