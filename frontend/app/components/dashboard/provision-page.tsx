import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CheckIcon, Sparkles, TriangleAlertIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClusterHostInfo } from "@/hooks/useHostInfo";
import { useCreateVM } from "@/hooks/useCreateVM";
import { useImages } from "@/hooks/useImages";
import { useSlaves } from "@/hooks/useSlaves";
import { useSettings } from "@/hooks/useSettings";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { PolicyGate } from "@/components/policy/policy-gate";
import { PolicyNotice } from "@/components/policy/policy-notice";
import { KEYBOARD_LAYOUTS, getKeyboardLabel } from "@/lib/keyboard-layouts";
import { SshAccessSwitch } from "@/components/ssh-access-switch";
import { VMImageSelect } from "@/components/dashboard/vm-image-picker";
import { cn } from "@/lib/utils";
import { FormRow } from "./provision/form-row";
import { SizeStepper } from "./provision/size-stepper";
import { NodeCard } from "./provision/capacity";
import { SummaryRail, type SummaryStatus } from "./provision/summary-rail";
import {
  buildPresets,
  clampSize,
  describeProblems,
  fitOnNode,
  formatCapacity,
  matchPreset,
  nodesFromCluster,
  placementLabel,
  SIZE_LIMITS,
  sizeFromSettings,
  type NodeFit,
  type Placement,
  type VmSize,
} from "./provision/model";

const NO_KEYBOARD = "__none__";

function PageHeader() {
  return (
    <header className="mb-8">
      <h1 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">
        Provision a VM
      </h1>
      <p className="mt-2 text-sm text-muted-foreground md:text-base">
        Name it, pick an image, size it, and choose where it runs.
      </p>
    </header>
  );
}

export default function ProvisionPage() {
  const authz = useAuthz();
  const navigate = useNavigate();
  const hasCreatePolicy = authz.hasPolicy(Policy.VMS_CREATE);
  const canReadHost = authz.hasPolicy(Policy.HOST_GET);
  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);
  const canManageSsh = authz.hasPolicy(Policy.VMS_SSH_MANAGE);

  // Data
  const { slaves } = useSlaves();
  const onlineSlaves = useMemo(
    () => slaves.filter((s) => s.status === "online"),
    [slaves],
  );
  const hasSlaves = onlineSlaves.length > 0;
  const { data: cluster } = useClusterHostInfo(canReadHost && hasCreatePolicy);
  const { data: settings } = useSettings(hasCreatePolicy);
  const { data: images } = useImages(canReadImages && hasCreatePolicy);
  const createVM = useCreateVM();

  // Form state
  const [name, setName] = useState("");
  // "touched" only once the user has typed and left the field, so an
  // untouched form never nags.
  const [nameTouched, setNameTouched] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);
  const [os, setOs] = useState("");
  const [size, setSize] = useState<VmSize>(sizeFromSettings(undefined));
  const [placement, setPlacement] = useState<Placement>(null);
  const [keyboard, setKeyboard] = useState("");
  const [ssh, setSsh] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Apply the user's defaults once, when they arrive.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (!settings || defaultsApplied.current) return;
    defaultsApplied.current = true;
    setSize(sizeFromSettings(settings));
    if (settings.default_os) setOs(settings.default_os);
    if (settings.default_keyboard_layout)
      setKeyboard(settings.default_keyboard_layout);
  }, [settings]);

  // Default to auto placement the first time slaves show up.
  const placementInitialized = useRef(false);
  useEffect(() => {
    if (hasSlaves && !placementInitialized.current) {
      placementInitialized.current = true;
      setPlacement("auto");
    }
  }, [hasSlaves]);
  // If the chosen slave goes offline, fall back to auto.
  useEffect(() => {
    if (
      placement !== "auto" &&
      placement !== null &&
      !onlineSlaves.some((s) => s.id === placement)
    ) {
      setPlacement(hasSlaves ? "auto" : null);
    }
  }, [placement, onlineSlaves, hasSlaves]);

  // Derived: presets, capacity, fit
  const base = useMemo(() => sizeFromSettings(settings), [settings]);
  const presets = useMemo(() => buildPresets(base), [base]);
  const activePreset = matchPreset(presets, size);

  const nodes = useMemo(() => {
    const fromCluster = nodesFromCluster(cluster);
    // Keep the master first, then online slaves in their listed order.
    const master = fromCluster.find((n) => n.id === null);
    const rest = onlineSlaves
      .map((s) => fromCluster.find((n) => n.id === s.id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n));
    return master ? [master, ...rest] : rest;
  }, [cluster, onlineSlaves]);
  const fits: NodeFit[] = useMemo(
    () => nodes.map((n) => fitOnNode(n, size)),
    [nodes, size],
  );
  const predicted =
    placement === "auto" ? (fits.find((f) => f.fits) ?? null) : null;
  const targetFit =
    placement === "auto"
      ? null
      : (fits.find((f) => f.node.id === placement) ?? null);

  // Validation
  const nameError = name.trim() === "" ? "Give it a name" : null;
  const imageError = os === "" ? "Choose an image" : null;
  let sizeError: string | null = null;
  if (fits.length > 0) {
    if (placement === "auto") {
      if (!fits.some((f) => f.fits)) sizeError = "Too big for every node";
    } else if (targetFit && !targetFit.fits) {
      sizeError = `Too big for ${targetFit.node.name}`;
    }
  }
  const showNameError = nameTouched || submitted ? nameError : null;
  const showImageError = submitted ? imageError : null;
  const errorCount = [nameError, imageError, sizeError].filter(Boolean).length;
  const visibleErrorCount = [showNameError, showImageError, sizeError].filter(
    Boolean,
  ).length;

  const selectedImage = images?.find((i) => i.image === os) ?? null;
  const placementText =
    placement === "auto"
      ? predicted
        ? `auto, ${predicted.node.name} first`
        : "auto"
      : placementLabel(placement, onlineSlaves);

  const status: SummaryStatus | null = (() => {
    if (sizeError) {
      const offending =
        placement === "auto"
          ? fits
          : fits.filter((f) => f.node.id === placement);
      const detail = offending
        .filter((f) => !f.fits)
        .map((f) => `${f.node.name} lacks ${describeProblems(f.problems)}`)
        .join("; ");
      return { tone: "error", text: `${sizeError}. ${detail}.` };
    }
    if (fits.length === 0) {
      return canReadHost
        ? null
        : {
            tone: "muted",
            text: "Capacity is hidden for your account; the host will refuse a VM that does not fit.",
          };
    }
    if (placement === "auto") {
      const ok = fits.filter((f) => f.fits).map((f) => f.node.name);
      return {
        tone: "ok",
        text:
          ok.length === fits.length
            ? `Fits on ${ok.join(" and ")}`
            : `Fits on ${ok.join(" and ")}, not on ${fits
                .filter((f) => !f.fits)
                .map((f) => f.node.name)
                .join(", ")}`,
      };
    }
    return {
      tone: "ok",
      text: `Fits on ${targetFit?.node.name ?? "the target"}`,
    };
  })();

  // Submit
  const submit = async () => {
    setSubmitted(true);
    if (errorCount > 0) {
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>("[data-invalid='true']")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    const slaveId =
      placement === "auto" || placement === null ? null : placement;
    try {
      await createVM.mutateAsync({
        os,
        name: name.trim(),
        vcpus: size.vcpus,
        mem: size.mem,
        disk_size: size.disk,
        keyboard_layout: keyboard || null,
        activate_at_start: autoStart,
        ssh_enabled: canManageSsh && ssh,
        slave_id: slaveId,
        auto_place: placement === "auto",
      });
      toast.success(`${name.trim()} is provisioned`);
      navigate("/dashboard");
    } catch {
      // The rail shows createVM.error.
    }
  };

  if (!hasCreatePolicy) {
    return (
      <div className="min-w-0 p-4 md:p-8">
        <PageHeader />
        <div className="max-w-xl">
          <PolicyNotice
            title="You cannot provision VMs"
            description="Ask an administrator for the policy below if you need to create virtual machines."
            missingPolicies={authz.missingPolicies([Policy.VMS_CREATE])}
          />
        </div>
      </div>
    );
  }

  const keyboardValue = keyboard === "" ? NO_KEYBOARD : keyboard;
  const keyboardKnown = KEYBOARD_LAYOUTS.some((kb) => kb.value === keyboard);
  const pending = createVM.isPending;
  const stepperHint = (key: keyof VmSize): string | null => {
    const relevant =
      placement === "auto" ? fits : fits.filter((f) => f.node.id === placement);
    if (relevant.length === 0) return null;
    const best = relevant.reduce((a, b) =>
      (
        key === "vcpus"
          ? a.node.cpuCount >= b.node.cpuCount
          : key === "mem"
            ? a.node.memFree >= b.node.memFree
            : a.node.diskFree >= b.node.diskFree
      )
        ? a
        : b,
    );
    if (key === "vcpus")
      return `${best.node.cpuCount} cores on ${best.node.name}`;
    if (key === "mem")
      return `${formatCapacity(best.node.memFree)} free on ${best.node.name}`;
    return `${formatCapacity(best.node.diskFree)} free on ${best.node.name}`;
  };

  return (
    <div className="min-w-0 p-4 md:p-8">
      <PageHeader />
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8"
      >
        <fieldset
          disabled={pending}
          className="m-0 min-w-0 flex-1 border-0 p-0"
        >
          <FormRow
            id="row-name"
            label="Name"
            help="Shown on the dashboard and used as the hostname."
            error={showNameError}
          >
            <Input
              ref={nameRef}
              id="vm-name"
              value={name}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="glo2000-lab-07"
              aria-invalid={showNameError ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameDirty(true);
              }}
              onBlur={() => {
                if (nameDirty) setNameTouched(true);
              }}
              className="h-10 max-w-md font-mono"
            />
          </FormRow>

          <FormRow
            id="row-image"
            label="Image"
            help={
              selectedImage
                ? "The disk the VM boots from."
                : "Pick the disk the VM boots from."
            }
            error={showImageError}
          >
            <PolicyGate
              requiredPolicies={[Policy.IMAGES_GET]}
              title="Images hidden"
            >
              <VMImageSelect
                selectedOS={os}
                setSelectedOS={(value) => setOs(value)}
                enabled={canReadImages}
              />
            </PolicyGate>
          </FormRow>

          <FormRow
            id="row-size"
            label="Size"
            help="Presets come from your defaults in Settings."
            error={sizeError}
          >
            <div className="space-y-4">
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label="Size preset"
              >
                {presets.map((p) => {
                  const active = activePreset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        setSize({ vcpus: p.vcpus, mem: p.mem, disk: p.disk })
                      }
                      className={cn(
                        "flex min-w-[7.5rem] flex-col items-start border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-foreground/30",
                      )}
                    >
                      <span className="text-sm font-medium">{p.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.vcpus} vCPU, {p.mem} GB, {p.disk} GB
                      </span>
                    </button>
                  );
                })}
                <div
                  role="radio"
                  aria-checked={activePreset === "custom"}
                  className={cn(
                    "flex min-w-[7.5rem] flex-col items-start border px-3 py-2 text-left",
                    activePreset === "custom"
                      ? "border-primary bg-primary/10"
                      : "border-dashed border-border text-muted-foreground",
                  )}
                >
                  <span className="text-sm font-medium">Custom</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    adjust below
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SizeStepper
                  label="vCPU"
                  value={size.vcpus}
                  min={SIZE_LIMITS.vcpus.min}
                  max={SIZE_LIMITS.vcpus.max}
                  step={SIZE_LIMITS.vcpus.step}
                  onChange={(v) =>
                    setSize((s) => ({ ...s, vcpus: clampSize("vcpus", v) }))
                  }
                  invalid={
                    fits.some(
                      (f) =>
                        f.problems.includes("vcpus") &&
                        (placement === "auto" || f.node.id === placement),
                    ) && Boolean(sizeError)
                  }
                  hint={stepperHint("vcpus")}
                />
                <SizeStepper
                  label="Memory"
                  unit="GB"
                  value={size.mem}
                  min={SIZE_LIMITS.mem.min}
                  max={SIZE_LIMITS.mem.max}
                  step={SIZE_LIMITS.mem.step}
                  onChange={(v) =>
                    setSize((s) => ({ ...s, mem: clampSize("mem", v) }))
                  }
                  invalid={
                    fits.some(
                      (f) =>
                        f.problems.includes("mem") &&
                        (placement === "auto" || f.node.id === placement),
                    ) && Boolean(sizeError)
                  }
                  hint={stepperHint("mem")}
                />
                <SizeStepper
                  label="Disk"
                  unit="GB"
                  value={size.disk}
                  min={SIZE_LIMITS.disk.min}
                  max={SIZE_LIMITS.disk.max}
                  step={SIZE_LIMITS.disk.step}
                  onChange={(v) =>
                    setSize((s) => ({ ...s, disk: clampSize("disk", v) }))
                  }
                  invalid={
                    fits.some(
                      (f) =>
                        f.problems.includes("disk") &&
                        (placement === "auto" || f.node.id === placement),
                    ) && Boolean(sizeError)
                  }
                  hint={stepperHint("disk")}
                />
              </div>

              {!canReadHost && (
                <PolicyNotice
                  title="Capacity hidden"
                  description="Without this policy the page cannot tell you whether the VM fits on a node."
                  missingPolicies={authz.missingPolicies([Policy.HOST_GET])}
                  compact
                />
              )}
            </div>
          </FormRow>

          <FormRow
            id="row-placement"
            label="Placement"
            help={
              hasSlaves
                ? "Which node runs the VM. Bars show what this size takes from each node."
                : "Only the master node is online."
            }
          >
            <div
              role="radiogroup"
              aria-label="Placement"
              className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3"
            >
              {hasSlaves && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={placement === "auto"}
                  onClick={() => setPlacement("auto")}
                  className={cn(
                    "flex min-h-[7rem] w-full flex-col items-start border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    placement === "auto"
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-foreground/30",
                  )}
                >
                  <span className="flex items-center gap-2 font-mono text-sm font-bold">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Auto
                  </span>
                  <span className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Master first. If it is short on room, the first node with
                    enough capacity takes the VM.
                  </span>
                  {placement === "auto" && fits.length > 0 && (
                    <span
                      className={cn(
                        "mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium",
                        predicted ? "text-chart-3" : "text-destructive",
                      )}
                    >
                      {predicted ? (
                        <>
                          <CheckIcon className="h-3.5 w-3.5" />
                          lands on {predicted.node.name}
                        </>
                      ) : (
                        <>
                          <TriangleAlertIcon className="h-3.5 w-3.5" />
                          no node has room
                        </>
                      )}
                    </span>
                  )}
                </button>
              )}
              {fits.length > 0
                ? fits.map((fit) => (
                    <NodeCard
                      key={fit.node.id ?? "master"}
                      fit={fit}
                      size={size}
                      selected={placement === fit.node.id}
                      predicted={
                        placement === "auto" &&
                        predicted?.node.id === fit.node.id
                      }
                      onSelect={
                        hasSlaves ? () => setPlacement(fit.node.id) : undefined
                      }
                    />
                  ))
                : [
                    { id: null as string | null, name: "master" },
                    ...onlineSlaves.map((s) => ({
                      id: s.id as string | null,
                      name: s.name,
                    })),
                  ].map((node) => (
                    <button
                      key={node.id ?? "master"}
                      type="button"
                      role="radio"
                      aria-checked={placement === node.id}
                      disabled={!hasSlaves}
                      onClick={() => setPlacement(node.id)}
                      className={cn(
                        "flex min-h-[4.5rem] w-full flex-col items-start border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        placement === node.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-foreground/30",
                      )}
                    >
                      <span className="font-mono text-sm font-bold">
                        {node.name}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        capacity hidden
                      </span>
                    </button>
                  ))}
            </div>
          </FormRow>

          <FormRow
            id="row-options"
            label="Options"
            help="Console keyboard, SSH, and what happens right after creation."
          >
            <div className="space-y-4">
              <div className="min-w-0 md:max-w-sm">
                <label
                  htmlFor="vm-keyboard"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Keyboard layout
                </label>
                <Select
                  key={keyboardKnown ? "known" : `unknown-${keyboard}`}
                  value={keyboardValue}
                  onValueChange={(v) => setKeyboard(v === NO_KEYBOARD ? "" : v)}
                >
                  <SelectTrigger id="vm-keyboard" className="h-10 w-full">
                    <SelectValue placeholder="VM default" />
                  </SelectTrigger>
                  <SelectContent>
                    {!keyboardKnown && keyboard !== "" && (
                      <SelectItem
                        value={keyboard}
                        className="focus:bg-muted focus:text-foreground"
                      >
                        {getKeyboardLabel(keyboard)} (from your settings)
                      </SelectItem>
                    )}
                    {KEYBOARD_LAYOUTS.map((kb) => (
                      <SelectItem
                        key={kb.value || NO_KEYBOARD}
                        value={kb.value || NO_KEYBOARD}
                        className="focus:bg-muted focus:text-foreground"
                      >
                        {kb.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {canManageSsh && (
                  <SshAccessSwitch enabled={ssh} onChange={setSsh} />
                )}
                <label
                  htmlFor="vm-autostart"
                  className="flex cursor-pointer items-center gap-3 border border-border p-4"
                >
                  <Checkbox
                    id="vm-autostart"
                    checked={autoStart}
                    onCheckedChange={(c) => setAutoStart(c === true)}
                  />
                  <span className="text-sm">
                    <span className="block font-medium">
                      Start after creation
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Otherwise it stays stopped until you start it.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </FormRow>
        </fieldset>

        <SummaryRail
          className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[19rem]"
          name={name.trim()}
          image={selectedImage}
          imageFile={os}
          size={size}
          placement={placementText}
          keyboard={keyboard ? getKeyboardLabel(keyboard) : "VM default"}
          ssh={canManageSsh ? ssh : null}
          autoStart={autoStart}
          status={status}
          errorCount={visibleErrorCount}
          pending={pending}
          submitError={
            createVM.isError
              ? `Provisioning failed. ${createVM.error.message || "Unknown error."}`
              : null
          }
        />
      </form>
    </div>
  );
}
