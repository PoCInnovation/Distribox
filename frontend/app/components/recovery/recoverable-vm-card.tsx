import { Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-4 min-w-0">
        <DistroLogo distribution={vm.distribution} className="w-10 h-10" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{vm.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {vm.vm_id}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">
              Distro: {vm.distribution}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Family: {vm.family}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Version: {vm.version}
            </Badge>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer"
          disabled={isOperating}
          onClick={() => onRecover(vm)}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Recover
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="cursor-pointer"
          disabled={isOperating}
          onClick={() => onClean(vm)}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Clean
        </Button>
      </div>
    </div>
  );
}
