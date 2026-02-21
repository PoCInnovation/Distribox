import { KeyRound } from "lucide-react";
import type { VirtualMachineMetadata } from "~/lib/types";

export const TableCredentialsColumn = ({
  data: vm,
}: {
  data?: VirtualMachineMetadata;
}) => {
  if (!vm) return null;

  return (
    <div className="h-full flex items-center py-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-sm">{vm.credentials_count}</span>
      </div>
    </div>
  );
};
