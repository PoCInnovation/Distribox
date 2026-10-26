import { CheckIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DistroLogo } from "@/components/distro-logo";
import type { ImageMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";
import { titleOfImage, type VmSize } from "./model";

export interface SummaryStatus {
  tone: "ok" | "warn" | "error" | "muted";
  text: string;
}

export function SummaryRail({
  name,
  image,
  imageFile,
  size,
  placement,
  keyboard,
  ssh,
  autoStart,
  status,
  errorCount,
  pending,
  submitError,
  className,
}: {
  name: string;
  image: ImageMetadata | null;
  imageFile: string;
  size: VmSize;
  placement: string;
  keyboard: string;
  ssh: boolean | null;
  autoStart: boolean;
  status: SummaryStatus | null;
  errorCount: number;
  pending: boolean;
  submitError: string | null;
  className?: string;
}) {
  const title = image ? titleOfImage(image) : null;

  return (
    <aside
      aria-label="Summary"
      className={cn("border border-border bg-card", className)}
    >
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">Virtual machine</p>
        <p
          className={cn(
            "mt-1 truncate font-mono text-lg font-bold leading-tight",
            !name && "text-muted-foreground/60",
          )}
          title={name || undefined}
        >
          {name || "unnamed"}
        </p>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        {image ? (
          <DistroLogo distribution={image.distribution} />
        ) : (
          <span className="h-9 w-9 shrink-0 border border-dashed border-border" />
        )}
        <div className="min-w-0 flex-1">
          {title ? (
            <>
              <p className="truncate text-sm font-medium">
                {title.title}{" "}
                <span className="font-mono text-muted-foreground">
                  {title.subtitle}
                </span>
                {image?.firmware === "efi" && (
                  <span className="ml-1.5 border border-border px-1 font-mono text-[10px] text-foreground/70">
                    UEFI
                  </span>
                )}
              </p>
              <p
                className="truncate font-mono text-xs text-muted-foreground"
                title={imageFile}
              >
                {imageFile}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No image chosen</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {[
          { label: "vCPU", value: String(size.vcpus) },
          { label: "memory", value: `${size.mem} GB` },
          { label: "disk", value: `${size.disk} GB` },
        ].map((cell) => (
          <div key={cell.label} className="px-5 py-3">
            <dd className="font-mono text-base font-bold tabular-nums leading-tight">
              {cell.value}
            </dd>
            <dt className="text-xs text-muted-foreground">{cell.label}</dt>
          </div>
        ))}
      </dl>

      <dl className="grid gap-y-1.5 border-b border-border px-5 py-4 text-sm">
        <Row label="Placement" value={placement} mono />
        <Row label="Keyboard" value={keyboard} />
        {ssh !== null && <Row label="SSH" value={ssh ? "allowed" : "off"} />}
        <Row label="After creation" value={autoStart ? "start" : "stay stopped"} />
      </dl>

      <div className="space-y-3 px-5 py-4">
        {status && (
          <p
            className={cn(
              "flex items-start gap-2 text-xs leading-relaxed",
              status.tone === "ok" && "text-chart-3",
              status.tone === "warn" && "text-amber-300",
              status.tone === "error" && "text-destructive",
              status.tone === "muted" && "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {status.tone === "ok" ? (
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : status.tone === "muted" ? null : (
              <TriangleAlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{status.text}</span>
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full font-medium"
          disabled={pending}
        >
          {pending ? (
            <>
              <LoaderCircleIcon className="animate-spin" />
              Provisioning
            </>
          ) : (
            "Provision VM"
          )}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          {errorCount > 0 ? (
            <span className="text-destructive">
              {errorCount === 1 ? "1 thing" : `${errorCount} things`} to fix
              above
            </span>
          ) : (
            <>
              <kbd className="border border-border px-1 font-mono">Ctrl</kbd>{" "}
              <kbd className="border border-border px-1 font-mono">Enter</kbd>{" "}
              also provisions
            </>
          )}
        </p>
        {submitError && (
          <p
            role="alert"
            className="border border-destructive/50 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
          >
            {submitError}
          </p>
        )}
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn("min-w-0 truncate text-right text-xs", mono && "font-mono")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
