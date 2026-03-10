import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Cpu, MemoryStick, HardDrive, RotateCcw } from "lucide-react";
import { DistroLogo } from "@/components/distro-logo";
import type { RecoverableVM, RecoverVMPayload } from "@/lib/types";

interface RecoverVMDialogProps {
  vm: RecoverableVM | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecover: (payload: RecoverVMPayload) => Promise<void>;
  isRecovering: boolean;
}

export function RecoverVMDialog({
  vm,
  open,
  onOpenChange,
  onRecover,
  isRecovering,
}: RecoverVMDialogProps) {
  const [name, setName] = useState("");
  const [vcpus, setVcpus] = useState("2");
  const [mem, setMem] = useState("4");
  const [diskSize, setDiskSize] = useState("20");

  const vcpusNum = Number.parseInt(vcpus) || 0;
  const memNum = Number.parseInt(mem) || 0;
  const diskNum = Number.parseInt(diskSize) || 0;

  const isValid = name.trim() !== "" && vcpusNum > 0 && memNum > 0 && diskNum > 0;

  const handleRecover = async () => {
    if (!vm || !isValid) return;
    await onRecover({
      vm_id: vm.vm_id,
      name: name.trim(),
      vcpus: vcpusNum,
      mem: memNum,
      disk_size: diskNum,
    });
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setName("");
    setVcpus("2");
    setMem("4");
    setDiskSize("20");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recover Virtual Machine</DialogTitle>
          <DialogDescription>
            Assign a name and resources to recover this VM back into the database.
          </DialogDescription>
        </DialogHeader>

        {vm && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/50 p-3 mb-2">
            <DistroLogo distribution={vm.distribution} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium">{vm.name}</span>
                <Badge variant="outline" className="text-xs">
                  Distro: {vm.distribution}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Version: {vm.version}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {vm.vm_id}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recover-name">VM Name</Label>
            <Input
              id="recover-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., recovered-dev-server"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="recover-vcpus" className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                vCPUs
              </Label>
              <Input
                id="recover-vcpus"
                type="number"
                min="1"
                value={vcpus}
                onChange={(e) => setVcpus(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recover-mem" className="flex items-center gap-1.5">
                <MemoryStick className="h-3.5 w-3.5" />
                RAM (GB)
              </Label>
              <Input
                id="recover-mem"
                type="number"
                min="1"
                value={mem}
                onChange={(e) => setMem(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recover-disk" className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                Disk (GB)
              </Label>
              <Input
                id="recover-disk"
                type="number"
                min="1"
                value={diskSize}
                onChange={(e) => setDiskSize(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isRecovering}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRecover}
            disabled={!isValid || isRecovering}
            className="cursor-pointer"
          >
            {isRecovering ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Recovering...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Recover VM
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
