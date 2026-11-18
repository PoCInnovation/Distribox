import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Policy, type Operation } from "@/lib/types";
import { getVMs } from "@/lib/api";
import { useAuthz } from "@/contexts/authz-context";
import { DistroLogo } from "@/components/distro-logo";
import { useOsInfo } from "@/components/dashboard/vm-os-label";
import { useDismissOperations } from "@/hooks/useOperations";
import { SegmentedProgress, StatusGlyph } from "./operation-progress";
import {
  formatAgo,
  formatBytes,
  formatClock,
  formatEta,
  formatRate,
  groupOperations,
  outcomeLabel,
  phaseEtaSeconds,
  phaseFraction,
  phaseIndex,
  phaseLabel,
  phaseSpeed,
} from "./operation-model";

/** The expanded activity view: every operation the server still lists. */
export function ActivityPanel({
  operations,
  now,
  onNavigate,
}: {
  operations: Operation[];
  now: number;
  onNavigate: () => void;
}) {
  const { running, attention, done } = groupOperations(operations);
  const dismiss = useDismissOperations();
  const vmIds = useVmIds();

  return (
    <div className="flex max-h-[min(78vh,40rem)] flex-col">
      <header className="flex items-baseline gap-3 border-b border-border px-4 py-3">
        <h2 className="font-mono text-sm font-semibold tracking-wide">
          Activity
        </h2>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {[
            running.length && `${running.length} running`,
            attention.length && `${attention.length} failed`,
            done.length && `${done.length} done`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {running.length > 0 && (
          <Section title="Running">
            {running.map((op) => (
              <RunningCard key={op.id} op={op} now={now} />
            ))}
          </Section>
        )}
        {attention.length > 0 && (
          <Section title="Failed">
            {attention.map((op) => (
              <FinishedRow
                key={op.id}
                op={op}
                now={now}
                canOpen={vmIds.has(op.vm_id ?? "")}
                onDismiss={() => dismiss.mutate([op.id])}
                onNavigate={onNavigate}
              />
            ))}
          </Section>
        )}
        {done.length > 0 && (
          <Section
            title="Done"
            action={
              <button
                type="button"
                onClick={() => dismiss.mutate(done.map((op) => op.id))}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            }
          >
            {done.map((op) => (
              <FinishedRow
                key={op.id}
                op={op}
                now={now}
                canOpen={vmIds.has(op.vm_id ?? "")}
                onDismiss={() => dismiss.mutate([op.id])}
                onNavigate={onNavigate}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

/** Ids of the VMs the user can see, to offer Open only for those. */
function useVmIds(): Set<string> {
  const authz = useAuthz();
  const { data } = useQuery({
    queryKey: ["vms"],
    queryFn: getVMs,
    enabled: authz.hasPolicy(Policy.VMS_GET),
    retry: false,
  });
  return useMemo(() => new Set(data?.map((vm) => vm.id)), [data]);
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/70 last:border-b-0">
      <div className="flex h-8 items-center px-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h3>
        <div className="ml-auto">{action}</div>
      </div>
      <ul className="divide-y divide-border/50">{children}</ul>
    </section>
  );
}

function SpecLine({ op }: { op: Operation }) {
  const os = useOsInfo(op.params?.os ?? "");
  const parts = [
    op.params?.os ? os.label : null,
    op.params?.vcpus != null ? `${op.params.vcpus} vCPU` : null,
    op.params?.mem != null ? `${op.params.mem} GB` : null,
    op.params?.disk_size != null ? `${op.params.disk_size} GB disk` : null,
    op.slave_name ?? (op.slave_id ? "Slave" : "Master"),
  ].filter(Boolean);
  return (
    <p className="truncate text-xs text-muted-foreground">
      {parts.join(" · ")}
    </p>
  );
}

function OsTile({ op }: { op: Operation }) {
  const os = useOsInfo(op.params?.os ?? "");
  return (
    <DistroLogo
      distribution={os.distribution}
      size="sm"
      className="size-8 bg-secondary"
    />
  );
}

function RunningCard({ op, now }: { op: Operation; now: number }) {
  const fraction = phaseFraction(op);
  const speed = phaseSpeed(op);
  const eta = phaseEtaSeconds(op);
  const step = phaseIndex(op) + 1;

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <OsTile op={op} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <p
              className="truncate font-mono text-[13.5px] font-medium"
              title={op.name}
            >
              {op.name}
            </p>
            <span className="ml-auto font-mono text-sm text-primary tabular-nums">
              {fraction !== null ? `${Math.floor(fraction * 100)}%` : null}
            </span>
          </div>
          <SpecLine op={op} />
        </div>
      </div>

      <SegmentedProgress op={op} className="mt-3 h-1.5" />

      <div className="mt-2 flex items-baseline gap-3 text-xs">
        <span className="font-medium text-foreground">{phaseLabel(op)}</span>
        {op.phases.length > 1 && (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {step}/{op.phases.length}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatClock(now - Date.parse(op.created_at))}
        </span>
      </div>

      {fraction !== null && op.bytes_done != null && op.bytes_total && (
        <div className="mt-1 flex items-baseline gap-3 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span>
            {formatBytes(op.bytes_done)} / {formatBytes(op.bytes_total)}
          </span>
          {speed !== null && <span>{formatRate(speed)}</span>}
          {eta !== null && <span className="ml-auto">{formatEta(eta)}</span>}
        </div>
      )}
    </li>
  );
}

function FinishedRow({
  op,
  now,
  canOpen,
  onDismiss,
  onNavigate,
}: {
  op: Operation;
  now: number;
  canOpen: boolean;
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const tone =
    op.status === "failed"
      ? "text-destructive"
      : op.status === "interrupted"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <li className="group/row px-4 py-3">
      <div className="flex items-center gap-2.5">
        <StatusGlyph op={op} className="size-4" />
        <p
          className="min-w-0 truncate font-mono text-[13px] font-medium"
          title={op.name}
        >
          {op.name}
        </p>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {formatAgo(op.finished_at ?? op.updated_at, now)}
        </span>
        {canOpen && (
          <Link
            to={`/dashboard?vm=${op.vm_id}`}
            onClick={onNavigate}
            className="inline-flex h-6 shrink-0 items-center gap-1 border border-border px-2 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            Open
            <ArrowUpRight className="size-3" />
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss ${op.name}`}
          className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className={cn("mt-1 pl-[26px] text-xs", tone)}>{outcomeLabel(op)}</p>
      {op.error && op.status === "failed" && (
        <p className="mt-1.5 ml-[26px] border-l-2 border-destructive/60 bg-destructive/[0.06] px-2 py-1.5 font-mono text-[11px] leading-relaxed break-words text-foreground/80">
          {op.error}
        </p>
      )}
    </li>
  );
}
