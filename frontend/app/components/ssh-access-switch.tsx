import { useId } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export function SshAccessSwitch({
  enabled,
  onChange,
  disabled = false,
  description = "Connect from a terminal using an existing access secret.",
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  description?: string;
}) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Terminal className="h-4 w-4" />
          Allow SSH
        </label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          enabled ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-foreground transition-transform",
            enabled ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
