import { Minus, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * A number with an explicit "system default" state (null).
 * Stepper buttons keep the value in range; typing is allowed and clamped on blur.
 */
export function DefaultNumberField({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  fallback = 2,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  /** Value used when switching from "system default" to a custom value. */
  fallback?: number;
}) {
  const custom = value !== null;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div
        className={cn(
          "flex h-9 items-stretch border border-input",
          !custom && "opacity-50",
        )}
      >
        <button
          type="button"
          aria-label={`Decrease ${unit}`}
          disabled={!custom || (value ?? 0) <= min}
          onClick={() => custom && onChange(clamp((value ?? min) - step))}
          className="flex w-8 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <div className="relative flex items-center border-x border-input">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            disabled={!custom}
            value={custom ? String(value) : ""}
            placeholder={custom ? undefined : "default"}
            aria-label={`Default ${unit}`}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, "");
              if (raw === "") return;
              onChange(Number.parseInt(raw, 10));
            }}
            onBlur={() => {
              if (custom) onChange(clamp(value ?? min));
            }}
            className="h-full w-16 bg-transparent pl-3 pr-1 text-right font-mono text-sm tabular-nums outline-none placeholder:font-sans placeholder:text-xs placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <span className="w-12 pr-3 text-xs text-muted-foreground">
            {unit}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Increase ${unit}`}
          disabled={!custom || (value ?? 0) >= max}
          onClick={() => custom && onChange(clamp((value ?? min) + step))}
          className="flex w-8 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={!custom}
          onCheckedChange={(checked) =>
            onChange(checked === true ? null : fallback)
          }
        />
        Use system default
      </label>
    </div>
  );
}
