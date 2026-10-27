import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "@/components/ui/secret-field";
import { cn } from "@/lib/utils";

/**
 * A command or config snippet with a copy button in the corner.
 * `title` is shown as a small caption (e.g. ".env" or "on the slave").
 */
export function CodeBlock({
  code,
  title,
  copyLabel = "Copied",
  className,
}: {
  code: string;
  title?: string;
  copyLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(code, copyLabel);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        "group relative border border-border bg-background/70",
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <span>{title}</span>
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-2.5 pr-11 font-mono text-xs leading-relaxed text-foreground">
        {code}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${title ?? "snippet"}`}
        className={cn(
          "absolute right-1.5 flex h-7 w-7 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:outline-none",
          title ? "top-8" : "top-1.5",
          copied && "text-success",
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
