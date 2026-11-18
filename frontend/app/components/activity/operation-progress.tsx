import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Operation } from "@/lib/types";
import { phaseFraction, phaseIndex, phaseWeight } from "./operation-model";

const FILL_TONE: Record<Operation["status"], string> = {
  running: "bg-primary",
  succeeded: "bg-success",
  failed: "bg-destructive",
  interrupted: "bg-warning",
};

/**
 * One segment per phase, sized by how long each phase usually takes. Done
 * phases are full, the current one fills with its byte fraction (or sweeps
 * when it can't be measured), later ones stay empty.
 */
export function SegmentedProgress({
  op,
  className,
}: {
  op: Operation;
  className?: string;
}) {
  const current = phaseIndex(op);
  const fraction = phaseFraction(op);
  const phases = op.phases.length ? op.phases : [op.phase];

  return (
    <div
      role="progressbar"
      aria-label={`${op.name} progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={
        op.status === "succeeded"
          ? 100
          : fraction !== null
            ? Math.round(fraction * 100)
            : undefined
      }
      className={cn("flex h-1 w-full gap-[3px]", className)}
    >
      {phases.map((phase, i) => {
        const done = op.status === "succeeded" || i < current;
        const active = !done && i === current;
        const sweeping = active && op.status === "running" && fraction === null;
        const width = done
          ? 100
          : active
            ? fraction !== null
              ? fraction * 100
              : op.status === "running"
                ? 0
                : 100
            : 0;
        return (
          <div
            key={phase}
            style={{ flexGrow: phaseWeight(phase) }}
            className="relative basis-0 overflow-hidden bg-foreground/[0.09]"
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear",
                done && op.status !== "succeeded"
                  ? "bg-primary/55"
                  : FILL_TONE[op.status],
                active &&
                  op.status === "running" &&
                  "shadow-[0_0_10px_var(--primary)]",
              )}
              style={{ width: `${width}%` }}
            />
            {sweeping && (
              <div className="animate-activity-sweep absolute inset-y-0 w-2/5 bg-gradient-to-r from-transparent via-primary to-transparent" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Circular progress for the collapsed sidebar. */
export function ProgressRing({
  fraction,
  size = 30,
  stroke = 2.5,
  tone = "primary",
  className,
}: {
  fraction: number | null;
  size?: number;
  stroke?: number;
  tone?: "primary" | "destructive" | "success";
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = fraction === null ? 0.28 : Math.max(0.02, fraction);
  const color =
    tone === "destructive"
      ? "var(--destructive)"
      : tone === "success"
        ? "var(--success)"
        : "var(--primary)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(fraction === null && "animate-spin", className)}
      style={fraction === null ? { animationDuration: "1.4s" } : undefined}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * shown} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray] duration-1000 ease-linear"
      />
    </svg>
  );
}

export function StatusGlyph({
  op,
  className,
}: {
  op: Operation;
  className?: string;
}) {
  if (op.status === "succeeded") {
    return (
      <CircleCheck
        className={cn("size-3.5 shrink-0 text-success", className)}
      />
    );
  }
  if (op.status === "failed") {
    return (
      <OctagonX
        className={cn("size-3.5 shrink-0 text-destructive", className)}
      />
    );
  }
  if (op.status === "interrupted") {
    return (
      <TriangleAlert
        className={cn("size-3.5 shrink-0 text-warning", className)}
      />
    );
  }
  return (
    <ProgressRing
      fraction={phaseFraction(op)}
      size={14}
      stroke={2}
      className={cn("shrink-0 text-foreground", className)}
    />
  );
}
