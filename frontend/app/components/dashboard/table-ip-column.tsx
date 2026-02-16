import { Copy } from "lucide-react";
import type { VirtualMachineMetadata } from "~/lib/types";
import { Button } from "@/components/ui/button";
import { useIPVisibilityStore } from "~/lib/store";
import { toast } from "sonner";

export const TableIPColumn = ({
  data: vm,
}: {
  data?: VirtualMachineMetadata;
}) => {
  const { showIP, hideIP, isIPVisible } = useIPVisibilityStore();

  if (!vm) return null;

  const isVisible = isIPVisible(vm.id);

  const handleCopy = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.stopPropagation();
    if (!vm.ipv4) return;
    await navigator.clipboard.writeText(vm.ipv4);
    toast.success("IP address copied to clipboard");
  };

  const handleReveal = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.stopPropagation();
    showIP(vm.id);
  };

  const handleHide = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.stopPropagation();
    hideIP(vm.id);
  };

  return (
    <>
      {vm.ipv4 !== null ? (
        <div
          className="flex items-center justify-between gap-2 py-2 w-full"
          data-no-row-click="true"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="group relative cursor-pointer rounded-full px-3 py-1 font-mono text-sm"
            data-no-row-click="true"
            onClick={isVisible ? handleHide : handleReveal}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span
              className={
                isVisible
                  ? "w-full h-full group-hover:blur-sm"
                  : "select-none w-full h-full group-hover:blur-sm"
              }
              data-no-row-click="true"
            >
              {isVisible ? vm.ipv4 : "•••.•••.•••.•••"}
            </span>
            {!isVisible && (
              <span
                className="absolute inset-0 flex items-center justify-center rounded-full text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 z-10"
                data-no-row-click="true"
              >
                show
              </span>
            )}
            {isVisible && (
              <span
                className="absolute inset-0 flex items-center justify-center rounded-full text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 z-10"
                data-no-row-click="true"
              >
                hide
              </span>
            )}
          </div>
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 z-10 cursor-pointer"
            data-no-row-click="true"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3" data-no-row-click="true" />
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground">No IP address available</span>
      )}
    </>
  );
};
