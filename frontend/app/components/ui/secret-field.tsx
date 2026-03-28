import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    toast.success(toastMessage);
  };

  return (
    <div
      className={`flex items-center justify-between gap-2 ${className ?? ""}`}
    >
      <div
        className="group relative cursor-pointer rounded-full px-3 py-1 font-mono text-sm"
        onClick={() => setVisible((v) => !v)}
      >
        <span
          className={
            visible
              ? "w-full h-full group-hover:blur-sm"
              : "select-none w-full h-full group-hover:blur-sm"
          }
        >
          {visible ? value : placeholder}
        </span>
        <span className="absolute inset-0 flex items-center justify-center rounded-full text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 z-10">
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
