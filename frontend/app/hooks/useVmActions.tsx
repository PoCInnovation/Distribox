import { createContext, useContext, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Copy,
  Pencil,
  Play,
  RotateCw,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useAuthz } from "@/contexts/authz-context";
import { Policy, VMState, type VirtualMachineMetadata } from "@/lib/types";
import { canConnect, isTransitional } from "@/lib/vm-state-ui";
import type { VmOperation } from "@/hooks/useVMs";

export type VmActionId =
  "connect" | "start" | "stop" | "restart" | "duplicate" | "rename" | "delete";

export interface VmAction {
  id: VmActionId;
  label: string;
  icon: LucideIcon;
  run: () => void;
  enabled: boolean;
  /** Short reason shown when the action is disabled. */
  reason?: string;
  /** Policies the current user lacks for this action. */
  missingPolicies: string[];
  destructive: boolean;
  /** Set when this action is currently in flight for the VM. */
  pending: boolean;
}

export interface VmActionHandlers {
  connect: (vm: VirtualMachineMetadata) => void;
  start: (vm: VirtualMachineMetadata) => void;
  stop: (vm: VirtualMachineMetadata) => void;
  restart: (vm: VirtualMachineMetadata) => void;
  duplicate: (vm: VirtualMachineMetadata) => void;
  rename: (vm: VirtualMachineMetadata) => void;
  delete: (vm: VirtualMachineMetadata) => void;
}

interface VmActionsContextValue {
  handlers: VmActionHandlers;
  pendingById: Map<string, VmOperation>;
}

const VmActionsContext = createContext<VmActionsContextValue | null>(null);

export function VmActionsProvider({
  handlers,
  pendingById,
  children,
}: VmActionsContextValue & { children: React.ReactNode }) {
  const value = useMemo(
    () => ({ handlers, pendingById }),
    [handlers, pendingById],
  );
  return (
    <VmActionsContext.Provider value={value}>
      {children}
    </VmActionsContext.Provider>
  );
}

export const PENDING_LABELS: Record<VmOperation, string> = {
  start: "Starting…",
  stop: "Stopping…",
  restart: "Restarting…",
  delete: "Deleting…",
  duplicate: "Duplicating…",
  rename: "Renaming…",
};

export function formatMissingPolicies(missing: string[]): string {
  return missing.length === 1
    ? `Needs the ${missing[0]} policy`
    : `Needs the ${missing.join(" and ")} policies`;
}

const ACTION_POLICIES: Record<VmActionId, Policy[]> = {
  connect: [Policy.VMS_CONNECT],
  start: [Policy.VMS_START],
  stop: [Policy.VMS_STOP],
  restart: [Policy.VMS_START, Policy.VMS_STOP],
  duplicate: [Policy.VMS_DUPLICATE],
  rename: [Policy.VMS_RENAME],
  delete: [Policy.VMS_DELETE],
};

/** Policies required for a given action; used by the bulk bar. */
export function policiesFor(id: VmActionId): Policy[] {
  return ACTION_POLICIES[id];
}

/** State-only availability, ignoring policies and pending operations. */
export function stateAllows(
  id: VmActionId,
  state: VMState,
): { ok: true } | { ok: false; reason: string } {
  const transitional = isTransitional(state);
  switch (id) {
    case "connect":
      return canConnect(state)
        ? { ok: true }
        : { ok: false, reason: "Only available while the VM is running" };
    case "start":
      if (state === VMState.RUNNING)
        return { ok: false, reason: "Already running" };
      if (transitional)
        return { ok: false, reason: "Wait for the current operation" };
      return { ok: true };
    case "stop":
      if (state === VMState.STOPPED)
        return { ok: false, reason: "Already stopped" };
      if (transitional)
        return { ok: false, reason: "Wait for the current operation" };
      return { ok: true };
    case "restart":
      if (state === VMState.PAUSED)
        return { ok: false, reason: "Resume VM or force stop it first" };
      if (state === VMState.STOPPED)
        return { ok: false, reason: "Start the VM instead" };
      if (transitional)
        return { ok: false, reason: "Wait for the current operation" };
      return { ok: true };
    case "duplicate":
      return state === VMState.STOPPED
        ? { ok: true }
        : { ok: false, reason: "Stop the VM before duplicating it" };
    case "rename":
    case "delete":
      return transitional
        ? { ok: false, reason: "Wait for the current operation" }
        : { ok: true };
  }
}

/**
 * Single source of truth for everything you can do to a VM. The row menu,
 * the drawer toolbar and the bulk bar all render from this list, so labels,
 * gating and disabled reasons can never drift apart.
 */
export function useVmActions(vm: VirtualMachineMetadata): {
  actions: VmAction[];
  byId: Record<VmActionId, VmAction>;
  /** Contextual primary action for a row: Connect when running, Start otherwise. */
  primary: VmAction;
  pendingOp: VmOperation | undefined;
} {
  const ctx = useContext(VmActionsContext);
  if (!ctx) {
    throw new Error("useVmActions must be used within a VmActionsProvider");
  }
  const authz = useAuthz();
  const { handlers, pendingById } = ctx;
  const pendingOp = pendingById.get(vm.id);

  return useMemo(() => {
    const build = (
      id: VmActionId,
      label: string,
      icon: LucideIcon,
      destructive = false,
    ): VmAction => {
      const missing = authz.missingPolicies(ACTION_POLICIES[id]);
      const allowed = stateAllows(id, vm.state);
      let enabled = true;
      let reason: string | undefined;
      if (missing.length > 0) {
        enabled = false;
        reason = formatMissingPolicies(missing);
      } else if (pendingOp) {
        enabled = false;
        reason = PENDING_LABELS[pendingOp];
      } else if (!allowed.ok) {
        enabled = false;
        reason = allowed.reason;
      }
      return {
        id,
        label,
        icon,
        run: () => handlers[id](vm),
        enabled,
        reason,
        missingPolicies: missing,
        destructive,
        pending: pendingOp === id,
      };
    };

    const byId: Record<VmActionId, VmAction> = {
      connect: build("connect", "Connect", Terminal),
      start: build(
        "start",
        vm.state === VMState.PAUSED ? "Resume VM" : "Start",
        Play,
      ),
      stop: build(
        "stop",
        vm.state === VMState.PAUSED ? "Force stop…" : "Stop",
        Square,
        vm.state === VMState.PAUSED,
      ),
      restart: build("restart", "Restart", RotateCw),
      duplicate: build("duplicate", "Duplicate", Copy),
      rename: build("rename", "Rename", Pencil),
      delete: build("delete", "Delete", Trash2, true),
    };
    const actions = [
      byId.connect,
      byId.start,
      byId.stop,
      byId.restart,
      byId.duplicate,
      byId.rename,
      byId.delete,
    ];
    const primary = canConnect(vm.state) ? byId.connect : byId.start;
    return { actions, byId, primary, pendingOp };
  }, [authz, handlers, pendingOp, vm]);
}
