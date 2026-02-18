import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { getPolicyColor } from "~/lib/get-policy-color";

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
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="group relative cursor-grab active:cursor-grabbing truncate"
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
      <div className="absolute left-full ml-2 top-0 w-64 p-3 bg-popover text-popover-foreground border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
        <p className="text-xs">{description}</p>
      </div>
    </div>
  );
}
