import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PolicyGate } from "@/components/policy/policy-gate";
import { SshAccessSwitch } from "@/components/ssh-access-switch";
import { useAuthz } from "@/contexts/authz-context";
import { useCreateEvent, useUpdateEvent } from "@/hooks/useEvents";
import { useClusterHostInfo } from "@/hooks/useHostInfo";
import { useSettings } from "@/hooks/useSettings";
import { KEYBOARD_LAYOUTS, getKeyboardLabel } from "@/lib/keyboard-layouts";
import { Policy } from "@/lib/types";
import type { Event } from "@/lib/types/event";
import { cn } from "@/lib/utils";
import { VMImageSelect } from "../vm-image-picker";
import { FormRow } from "../provision/form-row";
import { SizeStepper } from "../provision/size-stepper";
import {
  SIZE_LIMITS,
  buildPresets,
  clampSize,
  matchPreset,
  sizeFromSettings,
  type VmSize,
} from "../provision/model";
import { DeadlineField, FleetCapacity } from "../event-form-fields";
import {
  SLUG_PATTERN,
  displayUrl,
  eventShareUrl,
  slugify,
} from "./event-model";

const NO_KEYBOARD = "__none__";
const SEAT_LIMITS = { min: 1, max: 500 };

interface FormState {
  name: string;
  slug: string;
  slugEdited: boolean;
  os: string;
  distribution: string;
  size: VmSize;
  seats: number;
  deadline: Date | undefined;
  keyboard: string;
  ssh: boolean;
}

function initialState(
  event: Event | undefined,
  base: VmSize,
  defaultOs: string,
  defaultKeyboard: string,
): FormState {
  if (event) {
    return {
      name: event.name,
      slug: event.slug,
      slugEdited: true,
      os: event.vm_os,
      distribution: event.vm_distribution,
      size: {
        vcpus: event.vm_vcpus,
        mem: event.vm_mem,
        disk: event.vm_disk_size,
      },
      seats: event.max_vms,
      deadline: new Date(event.deadline),
      keyboard: event.keyboard_layout ?? "",
      ssh: event.ssh_enabled,
    };
  }
  return {
    name: "",
    slug: "",
    slugEdited: false,
    os: defaultOs,
    distribution: "",
    size: base,
    seats: 20,
    deadline: undefined,
    keyboard: defaultKeyboard,
    ssh: false,
  };
}

/**
 * Create and edit share one form, laid out like the Provision page: a label
 * gutter on the left, controls on the right, and a footer that shows what
 * the event costs at full capacity before you commit.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  event?: Event;
}) {
  const editing = !!event;
  const authz = useAuthz();
  const canReadHost = authz.hasPolicy(Policy.HOST_GET);
  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);
  const canManageSsh = authz.hasPolicy(Policy.VMS_SSH_MANAGE);

  const { data: clusterInfo } = useClusterHostInfo(canReadHost && open, 10_000);
  const { data: settings } = useSettings();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const mutation = editing ? updateEvent : createEvent;

  const base = useMemo(() => sizeFromSettings(settings), [settings]);
  const presets = useMemo(() => buildPresets(base), [base]);

  const [form, setForm] = useState<FormState>(() =>
    initialState(
      event,
      base,
      settings?.default_os ?? "",
      settings?.default_keyboard_layout ?? "",
    ),
  );
  const [submitted, setSubmitted] = useState(false);

  // Fresh form each time the dialog opens (and once settings arrive for a new event).
  useEffect(() => {
    if (!open) return;
    setForm(
      initialState(
        event,
        base,
        settings?.default_os ?? "",
        settings?.default_keyboard_layout ?? "",
      ),
    );
    setSubmitted(false);
    createEvent.reset();
    updateEvent.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, !!settings]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const slugValid = form.slug.length >= 2 && SLUG_PATTERN.test(form.slug);
  const deadlineValid = !!form.deadline && form.deadline.getTime() > Date.now();
  const errors = {
    name: form.name.trim() === "" ? "Give the event a name." : null,
    slug: !slugValid
      ? form.slug === ""
        ? "The link needs a slug."
        : "Use at least 2 lowercase letters, digits or dashes, not starting or ending with a dash."
      : null,
    os: form.os === "" ? "Pick the image every participant gets." : null,
    deadline: !form.deadline
      ? "Pick when joining closes."
      : !deadlineValid
        ? "The deadline is in the past."
        : null,
  };
  const valid = Object.values(errors).every((e) => e === null);
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : null);

  const activePreset = matchPreset(presets, form.size);
  const url = eventShareUrl(form.slug || "your-event");

  const submit = async () => {
    setSubmitted(true);
    if (!valid || !form.deadline) return;
    try {
      if (event) {
        await updateEvent.mutateAsync({
          eventId: event.id,
          payload: {
            name: form.name.trim(),
            vm_os: form.os,
            vm_vcpus: form.size.vcpus,
            vm_mem: form.size.mem,
            vm_disk_size: form.size.disk,
            max_vms: form.seats,
            deadline: form.deadline.toISOString(),
            ssh_enabled:
              canManageSsh && form.ssh !== event.ssh_enabled
                ? form.ssh
                : undefined,
          },
        });
      } else {
        await createEvent.mutateAsync({
          name: form.name.trim(),
          slug: form.slug,
          vm_os: form.os,
          vm_distribution: form.distribution,
          vm_vcpus: form.size.vcpus,
          vm_mem: form.size.mem,
          vm_disk_size: form.size.disk,
          keyboard_layout: form.keyboard || null,
          max_vms: form.seats,
          deadline: form.deadline.toISOString(),
          ssh_enabled: canManageSsh && form.ssh,
        });
      }
      onOpenChange(false);
    } catch {
      // shown from mutation state
    }
  };

  const keyboardKnown = KEYBOARD_LAYOUTS.some(
    (kb) => kb.value === form.keyboard,
  );
  const seatsBelowJoined = event
    ? form.seats < event.participants_count
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl"
        onOpenAutoFocus={(e) => {
          // Editing: don't land in the name field with its text selected.
          if (editing) e.preventDefault();
        }}
      >
        <DialogHeader className="border-b border-border px-6 pt-5 pb-4 text-left">
          <DialogTitle className="font-mono text-xl font-semibold tracking-tight">
            {editing ? "Edit event" : "New event"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply to machines handed out after you save. Existing participant VMs are not rebuilt."
              : "Everyone who opens the link and enters a name gets their own VM with this spec."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="event-form"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          autoComplete="off"
        >
          <fieldset
            disabled={mutation.isPending}
            className="m-0 min-w-0 border-0 p-0"
          >
            <FormRow
              label="Name"
              help="Shown to participants on the join page."
              error={show("name")}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <label
                    htmlFor="event-name"
                    className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  >
                    Event name
                  </label>
                  <Input
                    id="event-name"
                    value={form.name}
                    autoFocus={!editing}
                    autoComplete="off"
                    placeholder="Cloud workshop, fall 2026"
                    aria-invalid={show("name") ? true : undefined}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((f) => ({
                        ...f,
                        name,
                        slug: f.slugEdited ? f.slug : slugify(name),
                      }));
                    }}
                    className="h-10 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="event-slug"
                    className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  >
                    Join link
                  </label>
                  {editing ? (
                    <div className="flex h-10 items-center border border-border bg-secondary/40 px-3 font-mono text-sm text-muted-foreground">
                      <span className="truncate">{displayUrl(url)}</span>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex h-10 items-stretch border bg-background transition-colors focus-within:border-ring",
                        show("slug") ? "border-destructive" : "border-input",
                      )}
                    >
                      <span className="flex items-center border-r border-border bg-secondary/40 px-3 font-mono text-xs text-muted-foreground">
                        /events/
                      </span>
                      <input
                        id="event-slug"
                        value={form.slug}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="cloud-workshop"
                        aria-invalid={show("slug") ? true : undefined}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            slugEdited: true,
                            slug: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, ""),
                          }))
                        }
                        className="min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none placeholder:text-muted-foreground/50"
                      />
                    </div>
                  )}
                  <p
                    className={cn(
                      "mt-1.5 truncate text-xs",
                      show("slug")
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {show("slug") ??
                      (editing ? (
                        "The link cannot change once people have it."
                      ) : (
                        <>
                          Participants open{" "}
                          <span className="font-mono text-foreground/85">
                            {displayUrl(url)}
                          </span>
                        </>
                      ))}
                  </p>
                </div>
              </div>
            </FormRow>

            <FormRow
              label="Image"
              help="The disk every participant's VM boots from."
              error={show("os")}
            >
              <PolicyGate
                requiredPolicies={[Policy.IMAGES_GET]}
                title="Images hidden"
              >
                <VMImageSelect
                  selectedOS={form.os}
                  setSelectedOS={(os, distribution) =>
                    setForm((f) => ({
                      ...f,
                      os,
                      distribution: distribution ?? "",
                    }))
                  }
                  enabled={canReadImages}
                />
              </PolicyGate>
            </FormRow>

            <FormRow
              label="Size"
              help="Per participant. Presets come from your defaults in Settings."
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
                          set("size", {
                            vcpus: p.vcpus,
                            mem: p.mem,
                            disk: p.disk,
                          })
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
                    value={form.size.vcpus}
                    {...SIZE_LIMITS.vcpus}
                    onChange={(v) =>
                      set("size", {
                        ...form.size,
                        vcpus: clampSize("vcpus", v),
                      })
                    }
                    hint={
                      clusterInfo
                        ? `${clusterInfo.totals.cpu_count} cores in the cluster`
                        : undefined
                    }
                  />
                  <SizeStepper
                    label="Memory"
                    unit="GB"
                    value={form.size.mem}
                    {...SIZE_LIMITS.mem}
                    onChange={(v) =>
                      set("size", { ...form.size, mem: clampSize("mem", v) })
                    }
                    hint={
                      clusterInfo
                        ? `${Math.floor(clusterInfo.totals.mem_available)} GB free`
                        : undefined
                    }
                  />
                  <SizeStepper
                    label="Disk"
                    unit="GB"
                    value={form.size.disk}
                    {...SIZE_LIMITS.disk}
                    onChange={(v) =>
                      set("size", { ...form.size, disk: clampSize("disk", v) })
                    }
                    hint={
                      clusterInfo
                        ? `${(clusterInfo.totals.disk_available / 1024).toFixed(1)} TB free`
                        : undefined
                    }
                  />
                </div>
              </div>
            </FormRow>

            <FormRow
              label="Seats and deadline"
              help="Joining stops at whichever comes first: the last seat or the deadline."
              error={show("deadline")}
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                <SizeStepper
                  label="Seats"
                  value={form.seats}
                  min={SEAT_LIMITS.min}
                  max={SEAT_LIMITS.max}
                  step={1}
                  onChange={(v) =>
                    set(
                      "seats",
                      Math.min(SEAT_LIMITS.max, Math.max(SEAT_LIMITS.min, v)),
                    )
                  }
                  invalid={seatsBelowJoined}
                  hint={
                    seatsBelowJoined && event
                      ? `${event.participants_count} people already joined`
                      : "one VM per seat"
                  }
                />
                <DeadlineField
                  id="event-deadline"
                  value={form.deadline}
                  onChange={(d) => set("deadline", d)}
                  invalid={!!show("deadline")}
                />
              </div>
            </FormRow>

            <FormRow
              label="Options"
              help="Console keyboard and terminal access for participants."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <label
                    htmlFor="event-keyboard"
                    className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  >
                    Keyboard layout
                  </label>
                  {editing ? (
                    <div className="flex h-10 items-center border border-border bg-secondary/40 px-3 text-sm text-muted-foreground">
                      {form.keyboard
                        ? getKeyboardLabel(form.keyboard)
                        : "VM default"}
                      <span className="ml-auto text-xs">set at creation</span>
                    </div>
                  ) : (
                    <Select
                      key={keyboardKnown ? "known" : `unknown-${form.keyboard}`}
                      value={form.keyboard === "" ? NO_KEYBOARD : form.keyboard}
                      onValueChange={(v) =>
                        set("keyboard", v === NO_KEYBOARD ? "" : v)
                      }
                    >
                      <SelectTrigger
                        id="event-keyboard"
                        className="h-10 w-full"
                      >
                        <SelectValue placeholder="VM default" />
                      </SelectTrigger>
                      <SelectContent>
                        {!keyboardKnown && form.keyboard !== "" && (
                          <SelectItem value={form.keyboard}>
                            {getKeyboardLabel(form.keyboard)} (from your
                            settings)
                          </SelectItem>
                        )}
                        {KEYBOARD_LAYOUTS.map((kb) => (
                          <SelectItem
                            key={kb.value || NO_KEYBOARD}
                            value={kb.value || NO_KEYBOARD}
                          >
                            {kb.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {canManageSsh && (
                  <SshAccessSwitch
                    enabled={form.ssh}
                    onChange={(v) => set("ssh", v)}
                    description={
                      editing
                        ? "Applies to every participant VM, existing and future."
                        : "Participants get SSH details from the toolbar once connected."
                    }
                  />
                )}
              </div>
            </FormRow>
          </fieldset>
        </form>

        <footer className="flex flex-wrap items-center gap-4 border-t border-border bg-card px-6 py-4">
          <FleetCapacity
            className="min-w-0 flex-1"
            seats={form.seats}
            vcpus={form.size.vcpus}
            mem={form.size.mem}
            disk={form.size.disk}
            totals={clusterInfo?.totals}
          />
          {mutation.isError && (
            <p
              role="alert"
              className="flex basis-full items-start gap-2 text-sm text-destructive md:order-first"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {mutation.error instanceof Error
                ? mutation.error.message
                : editing
                  ? "Could not save the event."
                  : "Could not create the event."}
            </p>
          )}
          {submitted && !valid && (
            <p className="text-xs text-destructive">
              {Object.values(errors).filter(Boolean).length} field
              {Object.values(errors).filter(Boolean).length === 1
                ? " needs"
                : "s need"}{" "}
              attention
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="event-form"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {editing ? "Save changes" : "Create event"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
