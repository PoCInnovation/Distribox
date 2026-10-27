import { z } from "zod";

export enum Policy {
  ADMIN = "distribox:admin",
  AUTH_ME_GET = "auth:me:get",
  AUTH_CHANGE_PASSWORD = "auth:changePassword",
  HOST_GET = "host:get",
  IMAGES_GET = "images:get",
  IMAGES_UPLOAD = "images:upload",
  POLICIES_GET = "policies:get",
  USERS_GET = "users:get",
  USERS_CREATE = "users:create",
  USERS_UPDATE_POLICIES = "users:updatePolicies",
  USERS_DELETE = "users:delete",
  USERS_GET_PASSWORD = "users:getPassword",
  VMS_GET = "vms:get",
  VMS_GET_BY_ID = "vms:getById",
  VMS_CREATE = "vms:create",
  VMS_START = "vms:start",
  VMS_STOP = "vms:stop",
  VMS_CONNECT = "vms:connect",
  VMS_SSH_MANAGE = "vms:ssh:manage",
  VMS_CREDENTIALS_CREATE = "vms:credentials:create",
  VMS_DELETE = "vms:delete",
  VMS_SCREENSHOT = "vms:screenshot",
  VMS_CREDENTIALS_REVOKE = "vms:credentials:revoke",
  VMS_CREDENTIALS_LIST = "vms:credentials:list",
  VMS_CREDENTIALS_GET_BY_ID = "vms:credentials:getById",
  VMS_GET_RECOVERABLE = "vms:getRecoverableVms",
  VMS_DUPLICATE = "vms:duplicate",
  VMS_RENAME = "vms:rename",
  VMS_RECOVER = "vms:recoverVmById",
  VMS_CLEAN_RECOVERABLE = "vms:cleanRecoverableVmById",
  VMS_CLEAN_ALL_RECOVERABLE = "vms:cleanAllRecoverableVms",
  EVENTS_GET = "events:get",
  EVENTS_GET_BY_ID = "events:getById",
  EVENTS_CREATE = "events:create",
  EVENTS_UPDATE = "events:update",
  EVENTS_DELETE = "events:delete",
  SLAVES_GET = "slaves:get",
  SLAVES_GET_BY_ID = "slaves:getById",
  SLAVES_CREATE = "slaves:create",
  SLAVES_DELETE = "slaves:delete",
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
  [Policy.IMAGES_UPLOAD]: "Allows the user to upload local images.",
  [Policy.POLICIES_GET]: "Allows the user to fetch policies.",
  [Policy.USERS_GET]: "Allows the user to fetch users.",
  [Policy.USERS_CREATE]: "Allows the user to create users.",
  [Policy.USERS_UPDATE_POLICIES]: "Allows the user to update user policies.",
  [Policy.USERS_DELETE]: "Allows the user to delete users.",
  [Policy.USERS_GET_PASSWORD]: "Allows the user to fetch user passwords.",
  [Policy.VMS_GET]: "Allows the user to list virtual machines.",
  [Policy.VMS_GET_BY_ID]: "Allows the user to fetch a virtual machine by id.",
  [Policy.VMS_CREATE]: "Allows the user to create virtual machines.",
  [Policy.VMS_START]: "Allows the user to start virtual machines.",
  [Policy.VMS_STOP]: "Allows the user to stop virtual machines.",
  [Policy.VMS_CONNECT]:
    "Allows the user to connect to a virtual machine via the dashboard tunnel.",
  [Policy.VMS_SSH_MANAGE]: "Allows the user to enable or disable SSH access.",
  [Policy.VMS_CREDENTIALS_CREATE]:
    "Allows the user to create virtual machine credentials.",
  [Policy.VMS_DELETE]: "Allows the user to remove virtual machines.",
  [Policy.VMS_SCREENSHOT]:
    "Allows the user to take screenshots and access the monitor page.",
  [Policy.VMS_CREDENTIALS_REVOKE]:
    "Allows the user to revoke virtual machine credentials.",
  [Policy.VMS_CREDENTIALS_LIST]:
    "Allows the user to list virtual machine credentials.",
  [Policy.VMS_CREDENTIALS_GET_BY_ID]:
    "Allows the user to fetch a virtual machine credential by id.",
  [Policy.VMS_GET_RECOVERABLE]: "Allows the user to get all recoverable vms.",
  [Policy.VMS_DUPLICATE]: "Allows the user to duplicate a virtual machine.",
  [Policy.VMS_RENAME]: "Allows the user to rename a virtual machine.",
  [Policy.VMS_RECOVER]: "Allows the user to recover a vm by id.",
  [Policy.VMS_CLEAN_RECOVERABLE]:
    "Allows the user to clean a recoverable vm by id.",
  [Policy.VMS_CLEAN_ALL_RECOVERABLE]:
    "Allows the user to clean all recoverable vms.",
  [Policy.EVENTS_GET]: "Allows the user to list events.",
  [Policy.EVENTS_GET_BY_ID]: "Allows the user to fetch an event by id.",
  [Policy.EVENTS_CREATE]: "Allows the user to create events.",
  [Policy.EVENTS_UPDATE]: "Allows the user to update events.",
  [Policy.EVENTS_DELETE]: "Allows the user to delete events and their VMs.",
  [Policy.SLAVES_GET]: "Allows the user to list slave nodes.",
  [Policy.SLAVES_GET_BY_ID]: "Allows the user to fetch a slave node by id.",
  [Policy.SLAVES_CREATE]: "Allows the user to register a new slave node.",
  [Policy.SLAVES_DELETE]: "Allows the user to unregister a slave node.",
};

export const PolicySchema = z.string().min(1);
