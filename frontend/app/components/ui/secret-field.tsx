import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function fallbackCopy(text: string, toastMessage: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy failed");
    toast.success(toastMessage);
  } catch {
    toast.error("Could not copy. Reveal the secret and copy it manually.");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function copyToClipboard(text: string, toastMessage: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(toastMessage),
      () => fallbackCopy(text, toastMessage),
    );
  } else {
    fallbackCopy(text, toastMessage);
  }
}

interface SecretFieldProps {
  value: string;
  placeholder?: string;
  toastMessage?: string;
  className?: string;
  wrap?: boolean;
  /** `sm` is the original compact row; `md` is a boxed field for detail panels. */
  size?: "sm" | "md";
  /** Accessible name of the secret, used in the reveal/copy button labels. */
  label?: string;
  /** Start revealed (used right after a secret is generated). */
  defaultVisible?: boolean;
}

export function SecretField({
  value,
  placeholder = "••••••••••••",
  toastMessage = "Copied to clipboard",
  className,
  wrap = false,
  size = "sm",
  label = "secret",
  defaultVisible = false,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(defaultVisible);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(value, toastMessage);
  };

  const boxed = size === "md";
  const btnSize = boxed ? "icon-sm" : "icon";
  const btnClass = boxed ? "h-8 w-8 shrink-0" : "h-6 w-6 shrink-0";
  const iconClass = boxed ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        boxed && "border border-border bg-background/60 py-1 pl-1 pr-1",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 px-3 py-1 font-mono text-sm",
          wrap ? "break-all" : "truncate",
          !visible && "tracking-[0.2em] text-muted-foreground",
        )}
        aria-label={visible ? undefined : `${label} hidden`}
      >
        {visible ? value : placeholder}
      </span>
      <Button
        type="button"
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={visible}
        variant="secondary"
        size={btnSize}
        className={btnClass}
        onClick={(e) => {
          e.stopPropagation();
          setVisible((v) => !v);
        }}
      >
        {visible ? (
          <EyeOff className={iconClass} />
        ) : (
          <Eye className={iconClass} />
        )}
      </Button>
      <Button
        type="button"
        aria-label={`Copy ${label}`}
        variant="secondary"
        size={btnSize}
        className={cn(btnClass, "z-10 cursor-pointer")}
        onClick={handleCopy}
      >
        <Copy className={iconClass} />
      </Button>
    </div>
  );
}
