export interface CreateVMPayload {
  os: string;
  mem: number;
  vcpus: number;
  disk_size: number;
  activate_at_start: boolean;
}
