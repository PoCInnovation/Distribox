export interface CreateVMPayload {
  os: string;
  name: string;
  mem: number;
  vcpus: number;
  disk_size: number;
  activate_at_start: boolean;
}
