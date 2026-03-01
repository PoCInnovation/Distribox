import { cn } from "@/lib/utils";
import { InfoIcon, XIcon } from "lucide-react";
import { getPolicyColor } from "~/lib/get-policy-color";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PolicyBadgeProps {
  policy: string;
  description: string;
  onRemove?: () => void;
  removable?: boolean;
}

export function PolicyBadge({
  policy,
  description,
  onRemove,
  removable = false,
}: PolicyBadgeProps) {
  const colors = getPolicyColor(policy);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
              <XIcon className="h-4 w-4 cursor-pointer" />
            </button>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="flex flex-row space-x-2">
        <InfoIcon className="h-4 w-4 text-muted-foreground" />
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
