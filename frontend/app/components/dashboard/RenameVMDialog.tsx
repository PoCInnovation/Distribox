import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
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

  const trimmed = name.trim();
  const unchanged = !!vm && trimmed === vm.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vm) return;
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    if (unchanged) {
      setError("That is already the machine's name.");
      return;
    }

    setIsLoading(true);
    try {
      await onRename(vm.id, trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the VM.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename virtual machine</DialogTitle>
          <DialogDescription>
            Only the display name changes. The id, disk and credentials stay the
            same.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vm-name">Name</Label>
            <Input
              id="vm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              onFocus={(e) => e.currentTarget.select()}
              aria-invalid={!!error}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
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
            <Button type="submit" disabled={isLoading || !trimmed || unchanged}>
              {isLoading && <Loader2 className="animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
