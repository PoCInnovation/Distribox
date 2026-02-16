import type { VirtualMachineMetadata } from "~/lib/types";

export const TableIPColumn = ({
  data: vm,
}: {
  data?: VirtualMachineMetadata;
}) => {
  if (!vm) return null;
  return <p className="font-mono text-sm py-2">{vm.ipv4}</p>;
};
