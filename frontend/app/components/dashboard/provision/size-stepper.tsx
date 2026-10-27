import { useId, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A number field with minus/plus buttons. The value is typed in a mono
 * field; the unit sits inside the field so the row reads "4 GB".
 */
export function SizeStepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  invalid = false,
  disabled = false,
  hint,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  invalid?: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    onChange(Number.isFinite(parsed) ? parsed : min);
    setDraft(null);
  };

  const nudge = (dir: 1 | -1) => {
    const base = draft !== null ? Number.parseInt(draft, 10) || value : value;
    const next = Math.min(max, Math.max(min, base + dir * step));
    setDraft(null);
    onChange(next);
  };

  const buttonClass =
    "flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-10 items-stretch border bg-background transition-colors focus-within:border-ring",
          invalid ? "border-destructive" : "border-input",
          disabled && "opacity-50",
        )}
      >
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className={cn(buttonClass, "border-r border-border")}
          onClick={() => nudge(-1)}
          disabled={disabled || value <= min}
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={draft ?? String(value)}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(e.currentTarget.value);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                nudge(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                nudge(-1);
              }
            }}
            aria-invalid={invalid || undefined}
            className="h-full w-full min-w-0 bg-transparent pl-3 pr-12 text-center font-mono text-base tabular-nums text-foreground outline-none"
          />
          {unit && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className={cn(buttonClass, "border-l border-border")}
          onClick={() => nudge(1)}
          disabled={disabled || value >= max}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      {hint && (
        <p className="mt-1.5 min-h-4 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
