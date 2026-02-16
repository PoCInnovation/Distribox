export interface VirtualMachineMetadata {
  id: string;
  name: string;
  status: string; // TODO: enum
  vcpus: number;
  mem: number;
  disk_size: number;
  os: string;
  ip: string | null;
  // TODO: created_at
}
