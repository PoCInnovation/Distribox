import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function fallbackCopy(text: string, toastMessage: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  toast.success(toastMessage);
}

interface SecretFieldProps {
  value: string;
  placeholder?: string;
  toastMessage?: string;
  className?: string;
}

export function SecretField({
  value,
  placeholder = "••••••••••••",
  toastMessage = "Copied to clipboard",
  className,
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
      <div
        className="group relative min-w-0 cursor-pointer rounded-full px-3 py-1 font-mono text-sm"
        onClick={() => setVisible((v) => !v)}
      >
        <span
          className={
            visible
              ? "block truncate group-hover:blur-sm"
              : "block truncate select-none group-hover:blur-sm"
          }
        >
          {visible ? value : placeholder}
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 z-10">
          {visible ? "hide" : "show"}
        </span>
      </div>
      <Button
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
