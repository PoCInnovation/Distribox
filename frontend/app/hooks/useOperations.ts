import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { dismissOperation, getOperations } from "@/lib/api";
import { Policy, type Operation, type OperationStatus } from "@/lib/types";
import { useAuthz } from "@/contexts/authz-context";

export const OPERATIONS_KEY = ["operations"] as const;

const NO_OPERATIONS: Operation[] = [];
const BUSY_POLL_MS = 1_000;
const IDLE_POLL_MS = 15_000;

function anyRunning(ops: Operation[] | undefined): boolean {
  return !!ops?.some((op) => op.status === "running");
}

export function useOperations() {
  const authz = useAuthz();
  // vm.create is the only kind today; the backend returns [] without it.
  const enabled = authz.hasPolicy(Policy.VMS_CREATE);

  const query = useQuery<Operation[]>({
    queryKey: OPERATIONS_KEY,
    queryFn: getOperations,
    enabled,
    retry: false,
    refetchInterval: (q) =>
      anyRunning(q.state.data) ? BUSY_POLL_MS : IDLE_POLL_MS,
  });

  return {
    operations: query.data ?? NO_OPERATIONS,
    isLoading: query.isLoading,
  };
}

/** Put a just-started operation in the list before the next poll. */
export function addOperation(queryClient: QueryClient, op: Operation) {
  queryClient.setQueryData<Operation[]>(OPERATIONS_KEY, (prev) => [
    op,
    ...(prev ?? []).filter((o) => o.id !== op.id),
  ]);
}

export function useDismissOperations() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string[], { previous?: Operation[] }>({
    mutationFn: async (ids) => {
      await Promise.all(ids.map((id) => dismissOperation(id)));
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: OPERATIONS_KEY });
      const previous = queryClient.getQueryData<Operation[]>(OPERATIONS_KEY);
      queryClient.setQueryData<Operation[]>(OPERATIONS_KEY, (prev) =>
        prev?.filter((op) => !ids.includes(op.id)),
      );
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(OPERATIONS_KEY, context.previous);
      }
      toast.error(`Couldn't dismiss: ${error.message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: OPERATIONS_KEY });
    },
  });
}

/** Current time, refreshed every `intervalMs`, for timers and "x min ago". */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Reacts to operations finishing: refreshes the data they change and tells
 * the user. Mount once, in the dashboard layout.
 */
export function useOperationOutcomes(operations: Operation[]) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const seen = useRef<Map<string, OperationStatus> | null>(null);

  useEffect(() => {
    const previous = seen.current;
    const next = new Map(operations.map((op) => [op.id, op.status]));
    seen.current = next;
    // The first list after a page load only sets the baseline.
    if (previous === null) return;

    let changed = false;
    for (const op of operations) {
      if (previous.get(op.id) !== "running" || op.status === "running") {
        continue;
      }
      changed = true;
      if (op.status === "succeeded") {
        const vmId = op.vm_id;
        toast.success(`${op.name} is ready`, {
          action: vmId
            ? {
                label: "Open",
                onClick: () => navigate(`/dashboard?vm=${vmId}`),
              }
            : undefined,
          classNames: {
            actionButton:
              "!rounded-none !border !border-border !bg-transparent !text-foreground hover:!border-primary/50 hover:!text-primary",
          },
        });
      } else if (op.status === "failed") {
        toast.error(`Couldn't create ${op.name}`, {
          description: op.error ?? undefined,
        });
      } else {
        toast.warning(`Creating ${op.name} was interrupted`, {
          description: "The backend restarted while it was running.",
        });
      }
    }
    // A running operation that vanished was dismissed or expired elsewhere.
    for (const [id, status] of previous) {
      if (status === "running" && !next.has(id)) changed = true;
    }

    if (changed) {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      queryClient.invalidateQueries({ queryKey: ["host"] });
      queryClient.invalidateQueries({ queryKey: ["recoverable-vms"] });
    }
  }, [operations, queryClient, navigate]);
}
