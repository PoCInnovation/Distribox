import type { CreateVMCredentialPayload, VMCredential } from "@/lib/types";
import {
  CreateVMCredentialPayloadSchema,
  VMCredentialIdSchema,
  VMCredentialSchema,
} from "@/lib/types";
import { apiRequest, validateWithSchema } from "./core";

export async function createVMCredential(
  vmId: string,
  payload: CreateVMCredentialPayload,
): Promise<VMCredential> {
  const validatedVmId = validateWithSchema(VMCredentialIdSchema, vmId, "/vms/:vm_id/credentials/create");
  const validatedPayload = validateWithSchema(
    CreateVMCredentialPayloadSchema,
    payload,
    "/vms/:vm_id/credentials/create",
  );

  return apiRequest(
    `/vms/${validatedVmId}/credentials/create`,
    {
      method: "POST",
      body: JSON.stringify(validatedPayload),
    },
    VMCredentialSchema,
  );
}

export async function revokeVMCredential(
  vmId: string,
  credentialId: string,
): Promise<void> {
  const validatedVmId = validateWithSchema(VMCredentialIdSchema, vmId, "/vms/:vm_id/credentials/revoke/:credential_id");
  const validatedCredentialId = validateWithSchema(
    VMCredentialIdSchema,
    credentialId,
    "/vms/:vm_id/credentials/revoke/:credential_id",
  );

  return apiRequest<void>(
    `/vms/${validatedVmId}/credentials/revoke/${validatedCredentialId}`,
    {
      method: "DELETE",
    },
  );
}

export async function getVMCredentials(vmId: string): Promise<VMCredential[]> {
  const validatedVmId = validateWithSchema(VMCredentialIdSchema, vmId, "/vms/:vm_id/credentials");
  return apiRequest(
    `/vms/${validatedVmId}/credentials`,
    {},
    VMCredentialSchema.array(),
  );
}

export async function getVMCredential(
  vmId: string,
  credentialId: string,
): Promise<VMCredential> {
  const validatedVmId = validateWithSchema(VMCredentialIdSchema, vmId, "/vms/:vm_id/credentials/:credential_id");
  const validatedCredentialId = validateWithSchema(
    VMCredentialIdSchema,
    credentialId,
    "/vms/:vm_id/credentials/:credential_id",
  );

  return apiRequest(
    `/vms/${validatedVmId}/credentials/${validatedCredentialId}`,
    {},
    VMCredentialSchema,
  );
}
