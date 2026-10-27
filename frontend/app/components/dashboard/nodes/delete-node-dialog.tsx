import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClusterNode } from "./node-model";

export function DeleteNodeDialog({
  node,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  node: ClusterNode | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node) {
      setTyped("");
      setError(null);
    }
  }, [node]);

  const match = !!node && typed.trim() === node.name;
  const vmCount = node?.vms?.length ?? 0;
  const running = node?.vms?.filter((vm) => vm.state === "Running").length ?? 0;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!match) return;
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The master could not unregister it.",
      );
    }
  };

  return (
    <Dialog open={!!node} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleConfirm}>
          <DialogHeader>
            <DialogTitle className="font-mono">
              Unregister {node?.name}
            </DialogTitle>
            <DialogDescription>
              The master forgets this slave. Nothing is changed on the machine
              itself, but the master loses track of what runs there.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {vmCount > 0 ? (
              <div className="border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm">
                <span className="font-mono tabular-nums">{vmCount}</span> VM
                {vmCount > 1 ? "s are" : " is"} placed on this slave
                {running > 0 && (
                  <>
                    , <span className="font-mono tabular-nums">{running}</span>{" "}
                    running
                  </>
                )}
                . {vmCount > 1 ? "They become" : "It becomes"} unreachable from
                the dashboard. Delete or move {vmCount > 1 ? "them" : "it"}{" "}
                first if you still need {vmCount > 1 ? "them" : "it"}.
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No VMs are placed on this slave.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="confirm-node-name">
                Type{" "}
                <span className="font-mono text-foreground">{node?.name}</span>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-node-name"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={node?.name}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isDeleting}
            >
              Keep slave
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!match || isDeleting}
            >
              {isDeleting ? "Unregistering…" : "Unregister"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
