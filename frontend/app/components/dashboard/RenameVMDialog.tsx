import { useState, useEffect } from "react";
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
import type { VirtualMachineMetadata } from "@/lib/types";

interface RenameVMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vm: VirtualMachineMetadata | null;
  onRename: (vmId: string, name: string) => Promise<void>;
}

export function RenameVMDialog({
  open,
  onOpenChange,
  vm,
  onRename,
}: RenameVMDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && vm) {
      setName(vm.name);
      setError(null);
    }
  }, [open, vm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }

    if (!vm) return;

    if (trimmed === vm.name) {
      setError("New name must be different from the current name");
      return;
    }

    setIsLoading(true);

    try {
      await onRename(vm.id, trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to rename virtual machine",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename Virtual Machine</DialogTitle>
          <DialogDescription>
            Enter a new name for{" "}
            <span className="font-mono font-medium">{vm?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="vm-name">Name</Label>
              <Input
                id="vm-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
