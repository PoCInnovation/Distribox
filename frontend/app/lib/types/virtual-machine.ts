import { VMState } from "./vm-state";

export interface VirtualMachineMetadata {
  id: string;
  name: string;
  state: VMState; // TODO: enum
  vcpus: number;
  mem: number;
  disk_size: number;
  os: string;
  ipv4: string | null;
  // TODO: created_at
}
