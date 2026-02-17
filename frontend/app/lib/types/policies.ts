import { z } from "zod";

export enum Policy {
  ADMIN = "distribox:admin",
  AUTH_ME_GET = "auth:me:get",
  AUTH_CHANGE_PASSWORD = "auth:changePassword",
  HOST_GET = "host:get",
  IMAGES_GET = "images:get",
  POLICIES_GET = "policies:get",
  USERS_GET = "users:get",
  USERS_CREATE = "users:create",
  USERS_UPDATE_POLICIES = "users:updatePolicies",
  USERS_GET_PASSWORD = "users:getPassword",
  VMS_GET = "vms:get",
  VMS_GET_BY_ID = "vms:getById",
  VMS_CREATE = "vms:create",
  VMS_START = "vms:start",
  VMS_STOP = "vms:stop",
  VMS_UPDATE_PASSWORD = "vms:updatePassword",
  VMS_DELETE = "vms:delete",
  VMS_DELETE_PASSWORD = "vms:deletePassword",
}

export const POLICY_DESCRIPTIONS: Record<Policy, string> = {
  [Policy.ADMIN]:
    "This policy gives full access to the Distribox dashboard application.",
  [Policy.AUTH_ME_GET]:
    "Allows a user to fetch their own authenticated profile.",
  [Policy.AUTH_CHANGE_PASSWORD]: "Allows a user to change their own password.",
  [Policy.HOST_GET]: "Allows the user to fetch the host resources.",
  [Policy.IMAGES_GET]:
    "Allows the user to fetch images metadata from the registry.",
  [Policy.POLICIES_GET]: "Allows the user to fetch policies.",
  [Policy.USERS_GET]: "Allows the user to fetch users.",
  [Policy.USERS_CREATE]: "Allows the user to create users.",
  [Policy.USERS_UPDATE_POLICIES]: "Allows the user to update user policies.",
  [Policy.USERS_GET_PASSWORD]: "Allows the user to fetch user passwords.",
  [Policy.VMS_GET]: "Allows the user to list virtual machines.",
  [Policy.VMS_GET_BY_ID]: "Allows the user to fetch a virtual machine by id.",
  [Policy.VMS_CREATE]: "Allows the user to create virtual machines.",
  [Policy.VMS_START]: "Allows the user to start virtual machines.",
  [Policy.VMS_STOP]: "Allows the user to stop virtual machines.",
  [Policy.VMS_UPDATE_PASSWORD]:
    "Allows the user to set virtual machine passwords.",
  [Policy.VMS_DELETE]: "Allows the user to remove virtual machines.",
  [Policy.VMS_DELETE_PASSWORD]:
    "Allows the user to remove virtual machine passwords.",
};

export const PolicySchema = z.string().min(1);
