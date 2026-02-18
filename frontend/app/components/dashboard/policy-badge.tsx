import { cn } from "@/lib/utils";
import { getPolicyColor } from "~/lib/get-policy-color";

interface PolicyBadgeProps {
  policy: string;
  onRemove?: () => void;
  removable?: boolean;
}

export function PolicyBadge({
  policy,
  onRemove,
  removable = false,
}: PolicyBadgeProps) {
  const colors = getPolicyColor(policy);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-2 rounded-sm shadow-sm transition-all",
        colors.bg,
        colors.border,
        colors.hover,
        colors.text,
      )}
    >
      <span>{policy}</span>
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:opacity-70 transition-opacity font-bold text-base leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
