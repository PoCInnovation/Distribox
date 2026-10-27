import type { ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { policyTone } from "@/lib/policy-groups";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PolicyChipProps extends ComponentProps<"span"> {
  policy: string;
  onRemove?: () => void;
}

/** A policy label, coloured by its group, with the resource prefix dimmed. */
export function PolicyChip({
  policy,
  onRemove,
  className,
  ...props
}: PolicyChipProps) {
  const tone = policyTone(policy);
  const split = policy.indexOf(":") + 1;

  return (
    <span
      {...props}
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1 border px-2 font-mono text-xs whitespace-nowrap transition-colors",
        tone.chip,
        className,
      )}
    >
      <span className="truncate">
        <span className="opacity-55">{policy.slice(0, split)}</span>
        {policy.slice(split)}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${policy}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-1 grid size-5 shrink-0 cursor-pointer place-items-center opacity-55 transition-opacity hover:opacity-100"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </span>
  );
}

interface PolicyBadgeProps {
  policy: string;
  description: string;
  onRemove?: () => void;
}

export function PolicyBadge({ policy, description, onRemove }: PolicyBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PolicyChip
          policy={policy}
          onRemove={onRemove}
          className={policyTone(policy).hover}
        />
      </TooltipTrigger>
      {description && <TooltipContent>{description}</TooltipContent>}
    </Tooltip>
  );
}
