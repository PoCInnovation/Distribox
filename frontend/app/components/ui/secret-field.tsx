import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface SecretFieldProps {
  value: string;
  placeholder?: string;
  toastMessage?: string;
  className?: string;
  wrap?: boolean;
}

export function SecretField({
  value,
  placeholder = "••••••••••••",
  toastMessage = "Copied to clipboard",
  className,
  wrap = false,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(
        () => toast.success(toastMessage),
        () => fallbackCopy(value, toastMessage),
      );
    } else {
      fallbackCopy(value, toastMessage);
    }
  };

  return (
    <div
      className={`flex items-center justify-between gap-2 ${className ?? ""}`}
    >
      <span
        className={`min-w-0 flex-1 px-3 py-1 font-mono text-sm ${wrap ? "break-all" : "truncate"}`}
      >
        {visible ? value : placeholder}
      </span>
      <Button
        type="button"
        aria-label={visible ? "Hide secret" : "Show secret"}
        aria-pressed={visible}
        variant="secondary"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Button>
      <Button
        type="button"
        aria-label="Copy secret"
        variant="secondary"
        size="icon"
        className="h-6 w-6 z-10 shrink-0 cursor-pointer"
        onClick={handleCopy}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
