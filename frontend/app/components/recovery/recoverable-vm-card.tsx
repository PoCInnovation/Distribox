import { Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DistroLogo } from "@/components/distro-logo";
import type { RecoverableVM } from "@/lib/types";

interface RecoverableVMCardProps {
  vm: RecoverableVM;
  onRecover: (vm: RecoverableVM) => void;
  onClean: (vm: RecoverableVM) => void;
  isOperating: boolean;
}

export function RecoverableVMCard({
  vm,
  onRecover,
  onClean,
  isOperating,
}: RecoverableVMCardProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-3.5">
      <DistroLogo distribution={vm.distribution} className="rounded-none" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-medium text-foreground">
          {vm.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {vm.distribution} {vm.version}
          <span className="mx-1.5 text-border">|</span>
          {vm.image}
          <span className="mx-1.5 text-border">|</span>
          rev {vm.revision}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
          {vm.vm_id}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" disabled={isOperating} onClick={() => onRecover(vm)}>
          <RotateCcw />
          Recover
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isOperating}
          onClick={() => onClean(vm)}
        >
          <Trash2 />
          Delete files
        </Button>
      </div>
    </div>
  );
}
