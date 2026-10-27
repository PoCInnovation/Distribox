import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/components/ui/secret-field";

/**
 * Inline technical value (IP, id) that copies itself on click. The copy
 * icon only appears on hover so the cell stays quiet.
 */
export function CopyText({
  value,
  display,
  label,
  className,
  mono = true,
}: {
  value: string;
  display?: string;
  label: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      data-no-row-click="true"
      title={`Copy ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(value, `${label} copied`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className={cn(
        "group/copy inline-flex max-w-full items-center gap-1.5 text-left text-foreground/90 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none",
        mono && "font-mono",
        className,
      )}
    >
      <span className="truncate">{display ?? value}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-success" />
      ) : (
        <Copy className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-70 group-focus-visible/copy:opacity-70" />
      )}
    </button>
  );
}
