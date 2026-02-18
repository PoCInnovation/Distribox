import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { getPolicyColor } from "~/lib/get-policy-color";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

interface DraggablePolicyBadgeProps {
  policy: string;
  description: string;
}

export function DraggablePolicyBadge({
  policy,
  description,
}: DraggablePolicyBadgeProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `policy-${policy}`,
      data: { policy, description },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const colors = getPolicyColor(policy);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing truncate"
        >
          <div
            className={cn(
              "w-full px-4 py-2.5 text-sm font-medium transition-all duration-200",
              "border-2 rounded-sm shadow-sm",
              "cursor-grab active:cursor-grabbing",
              colors.bg,
              colors.border,
              colors.hover,
              colors.text,
            )}
          >
            {policy}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="flex flex-row space-x-2">
        <InfoIcon className="h-4 w-4 text-muted-foreground" />
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
