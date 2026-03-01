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
  USERS_DELETE = "users:delete",
  USERS_GET_PASSWORD = "users:getPassword",
  VMS_GET = "vms:get",
  VMS_GET_BY_ID = "vms:getById",
  VMS_CREATE = "vms:create",
  VMS_START = "vms:start",
  VMS_STOP = "vms:stop",
  VMS_CREDENTIALS_CREATE = "vms:credentials:create",
  VMS_DELETE = "vms:delete",
  VMS_CREDENTIALS_REVOKE = "vms:credentials:revoke",
  VMS_CREDENTIALS_LIST = "vms:credentials:list",
  VMS_CREDENTIALS_GET_BY_ID = "vms:credentials:getById",
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
  [Policy.USERS_DELETE]: "Allows the user to delete users.",
  [Policy.USERS_GET_PASSWORD]: "Allows the user to fetch user passwords.",
  [Policy.VMS_GET]: "Allows the user to list virtual machines.",
  [Policy.VMS_GET_BY_ID]: "Allows the user to fetch a virtual machine by id.",
  [Policy.VMS_CREATE]: "Allows the user to create virtual machines.",
  [Policy.VMS_START]: "Allows the user to start virtual machines.",
  [Policy.VMS_STOP]: "Allows the user to stop virtual machines.",
  [Policy.VMS_CREDENTIALS_CREATE]:
    "Allows the user to create virtual machine credentials.",
  [Policy.VMS_DELETE]: "Allows the user to remove virtual machines.",
  [Policy.VMS_CREDENTIALS_REVOKE]:
    "Allows the user to revoke virtual machine credentials.",
  [Policy.VMS_CREDENTIALS_LIST]:
    "Allows the user to list virtual machine credentials.",
  [Policy.VMS_CREDENTIALS_GET_BY_ID]:
    "Allows the user to fetch a virtual machine credential by id.",
};

export const PolicySchema = z.string().min(1);

// Policy color mapping with vibrant colors and transparent backgrounds
export const POLICY_COLORS = {
  [Policy.ADMIN]: {
    bg: "bg-purple-500/20",
    border: "border-purple-500",
    hover: "hover:bg-purple-500/30",
    text: "text-purple-600 dark:text-purple-400",
  },
  [Policy.AUTH_ME_GET]: {
    bg: "bg-cyan-500/20",
    border: "border-cyan-500",
    hover: "hover:bg-cyan-500/30",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  [Policy.AUTH_CHANGE_PASSWORD]: {
    bg: "bg-amber-500/20",
    border: "border-amber-500",
    hover: "hover:bg-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  [Policy.HOST_GET]: {
    bg: "bg-slate-500/20",
    border: "border-slate-500",
    hover: "hover:bg-slate-500/30",
    text: "text-slate-600 dark:text-slate-400",
  },
  [Policy.IMAGES_GET]: {
    bg: "bg-sky-500/20",
    border: "border-sky-500",
    hover: "hover:bg-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
  },
  [Policy.POLICIES_GET]: {
    bg: "bg-violet-500/20",
    border: "border-violet-500",
    hover: "hover:bg-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
  },
  [Policy.USERS_GET]: {
    bg: "bg-blue-500/20",
    border: "border-blue-500",
    hover: "hover:bg-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
  },
  [Policy.USERS_CREATE]: {
    bg: "bg-emerald-500/20",
    border: "border-emerald-500",
    hover: "hover:bg-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  [Policy.USERS_UPDATE_POLICIES]: {
    bg: "bg-yellow-500/20",
    border: "border-yellow-500",
    hover: "hover:bg-yellow-500/30",
    text: "text-yellow-600 dark:text-yellow-500",
  },
  [Policy.USERS_DELETE]: {
    bg: "bg-red-500/20",
    border: "border-red-500",
    hover: "hover:bg-red-500/30",
    text: "text-red-600 dark:text-red-400",
  },
  [Policy.USERS_GET_PASSWORD]: {
    bg: "bg-rose-500/20",
    border: "border-rose-500",
    hover: "hover:bg-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
  [Policy.VMS_GET]: {
    bg: "bg-indigo-500/20",
    border: "border-indigo-500",
    hover: "hover:bg-indigo-500/30",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  [Policy.VMS_GET_BY_ID]: {
    bg: "bg-blue-600/20",
    border: "border-blue-600",
    hover: "hover:bg-blue-600/30",
    text: "text-blue-700 dark:text-blue-400",
  },
  [Policy.VMS_CREATE]: {
    bg: "bg-teal-500/20",
    border: "border-teal-500",
    hover: "hover:bg-teal-500/30",
    text: "text-teal-600 dark:text-teal-400",
  },
  [Policy.VMS_START]: {
    bg: "bg-lime-500/20",
    border: "border-lime-500",
    hover: "hover:bg-lime-500/30",
    text: "text-lime-600 dark:text-lime-400",
  },
  [Policy.VMS_STOP]: {
    bg: "bg-orange-500/20",
    border: "border-orange-500",
    hover: "hover:bg-orange-500/30",
    text: "text-orange-600 dark:text-orange-400",
  },
  [Policy.VMS_CREDENTIALS_CREATE]: {
    bg: "bg-pink-500/20",
    border: "border-pink-500",
    hover: "hover:bg-pink-500/30",
    text: "text-pink-600 dark:text-pink-400",
  },
  [Policy.VMS_DELETE]: {
    bg: "bg-red-500/20",
    border: "border-red-500",
    hover: "hover:bg-red-500/30",
    text: "text-red-600 dark:text-red-400",
  },
  [Policy.VMS_CREDENTIALS_REVOKE]: {
    bg: "bg-fuchsia-500/20",
    border: "border-fuchsia-500",
    hover: "hover:bg-fuchsia-500/30",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  [Policy.VMS_CREDENTIALS_LIST]: {
    bg: "bg-cyan-600/20",
    border: "border-cyan-600",
    hover: "hover:bg-cyan-600/30",
    text: "text-cyan-700 dark:text-cyan-400",
  },
  [Policy.VMS_CREDENTIALS_GET_BY_ID]: {
    bg: "bg-sky-700/20",
    border: "border-sky-700",
    hover: "hover:bg-sky-700/30",
    text: "text-sky-700 dark:text-sky-400",
  },
  default: {
    bg: "bg-gray-500/20",
    border: "border-gray-500",
    hover: "hover:bg-gray-500/30",
    text: "text-gray-600 dark:text-gray-400",
  },
};
