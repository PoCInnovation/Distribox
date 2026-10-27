import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { policyTone } from "@/lib/policy-groups";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PolicyChip } from "./policy-badge";

interface DraggablePolicyBadgeProps {
  policy: string;
  description: string;
}

export function DraggablePolicyBadge({
  policy,
  description,
}: DraggablePolicyBadgeProps) {
  // The DragOverlay follows the pointer, so the source stays put.
  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({
      id: `policy-${policy}`,
      data: { policy, description },
    });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PolicyChip
          ref={setNodeRef}
          policy={policy}
          {...listeners}
          {...attributes}
          className={cn(
            "cursor-grab touch-none active:cursor-grabbing",
            policyTone(policy).hover,
            isDragging && "opacity-40",
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}
