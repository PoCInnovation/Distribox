import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import {
  formatDateOnly,
  formatDateTime,
  formatRelative,
  useTimezone,
} from "@/hooks/useTimezone";
import { useAuthz } from "@/contexts/authz-context";
import { VMImageSelect } from "@/components/dashboard/vm-image-picker";
import { Policy } from "@/lib/types";
import type { UserSettings } from "@/lib/types";
import { isAdmin } from "@/lib/is-admin";
import { KEYBOARD_LAYOUTS } from "@/lib/keyboard-layouts";
import { cn } from "@/lib/utils";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { DefaultNumberField } from "./settings/default-number-field";
import { PermissionsSummary } from "./settings/permissions-summary";
import { AUTO_TZ, TimezoneCombobox } from "./settings/timezone-combobox";

/* ------------------------------------------------------------------ */
/* Draft model                                                         */
/* ------------------------------------------------------------------ */

interface Draft {
  vcpus: number | null;
  mem: number | null;
  disk: number | null;
  os: string;
  keyboard: string;
  timezone: string;
}

function fromSettings(s: UserSettings): Draft {
  const num = (n: number | null) => (n && n > 0 ? n : null);
  return {
    vcpus: num(s.default_vcpus),
    mem: num(s.default_mem),
    disk: num(s.default_disk_size),
    os: s.default_os ?? "",
    keyboard: s.default_keyboard_layout ?? "",
    timezone: s.timezone || AUTO_TZ,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.vcpus === b.vcpus &&
    a.mem === b.mem &&
    a.disk === b.disk &&
    a.os === b.os &&
    a.keyboard === b.keyboard &&
    a.timezone === b.timezone
  );
}

const KEYBOARD_NONE = "__vm_default__";

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "permissions", label: "Permissions" },
  { id: "vm-defaults", label: "VM defaults" },
  { id: "preferences", label: "Preferences" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function useActiveSection(ready: boolean): SectionId {
  const [active, setActive] = useState<SectionId>("account");
  useEffect(() => {
    if (!ready) return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (els.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting)
            visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size === 0) return;
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActive(top[0] as SectionId);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready]);
  return active;
}

function Section({
  id,
  title,
  description,
  dirty,
  children,
}: {
  id: SectionId;
  title: string;
  description: string;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 id={`${id}-title`} className="font-mono text-lg font-semibold">
          {title}
        </h2>
        {dirty && (
          <span className="font-mono text-[11px] text-warning">unsaved</span>
        )}
      </div>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        {description}
      </p>
      <div
        className={cn(
          "border bg-card",
          dirty ? "border-warning/50" : "border-border",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  help,
  htmlFor,
  children,
  stacked = false,
}: {
  label: string;
  help?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  /** Control takes the full width under the label (for the image picker). */
  stacked?: boolean;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div
      className={cn(
        "border-b border-border/70 px-5 py-4 last:border-b-0",
        stacked
          ? "space-y-3"
          : "grid gap-x-6 gap-y-2 sm:grid-cols-[200px_minmax(0,1fr)]",
      )}
    >
      <div>
        <Label htmlFor={htmlFor} className="text-sm leading-6">
          {label}
        </Label>
        {help && (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {help}
          </p>
        )}
      </div>
      <div className="min-w-0 self-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const authz = useAuthz();
  const { user } = authz;
  const { data: settings, error, isFetching, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const effectiveTimezone = useTimezone();

  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);
  const canChangePassword = authz.hasPolicy(Policy.AUTH_CHANGE_PASSWORD);

  const server = useMemo(
    () => (settings ? fromSettings(settings) : null),
    [settings],
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const active = useActiveSection(draft !== null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const lastServer = useRef<Draft | null>(null);

  // Adopt server values on first load, and again whenever they change while
  // the user has no pending edits.
  useEffect(() => {
    if (!server) return;
    const wasClean =
      draft === null ||
      (lastServer.current !== null && sameDraft(draft, lastServer.current));
    lastServer.current = server;
    if (wasClean) setDraft(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  const dirty = !!draft && !!server && !sameDraft(draft, server);
  const dirtyVm =
    !!draft &&
    !!server &&
    (draft.vcpus !== server.vcpus ||
      draft.mem !== server.mem ||
      draft.disk !== server.disk ||
      draft.os !== server.os ||
      draft.keyboard !== server.keyboard);
  const dirtyPrefs = !!draft && !!server && draft.timezone !== server.timezone;

  const patch = (p: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));

  const save = useCallback(async () => {
    if (!draft || !dirty) return;
    try {
      await updateSettings.mutateAsync({
        default_vcpus: draft.vcpus,
        default_mem: draft.mem,
        default_disk_size: draft.disk,
        default_os: draft.os || null,
        default_keyboard_layout: draft.keyboard || null,
        timezone: draft.timezone || AUTO_TZ,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Settings could not be saved",
      );
    }
  }, [draft, dirty, updateSettings]);

  const discard = () => {
    if (server) setDraft(server);
  };

  // Ctrl/Cmd+S saves when there is something to save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Warn before the tab closes with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const jumpTo = (id: SectionId) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loadError = error && (
    <div className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <p role="alert">
        <span className="text-destructive">
          {draft
            ? "Settings could not be refreshed. Your unsaved changes are preserved."
            : "Settings could not be loaded."}
        </span>{" "}
        <span className="text-muted-foreground">{error.message}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={isFetching}
        onClick={() => void refetch()}
      >
        {isFetching ? (
          <>
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Retrying…
          </>
        ) : (
          "Retry"
        )}
      </Button>
    </div>
  );

  if (!draft && !error) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="relative min-h-full p-8">
        <h1 className="mb-8 font-mono text-3xl font-bold tracking-tight">
          Settings
        </h1>
        <div className="max-w-3xl">{loadError}</div>
      </div>
    );
  }

  const admin = isAdmin(user);
  const keyboardLabel =
    KEYBOARD_LAYOUTS.find((k) => k.value === draft.keyboard)?.label ??
    "None (VM default)";

  return (
    <div className="relative min-h-full p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Your account, what it may do, and the defaults the dashboard fills in
          for you.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[168px_minmax(0,1fr)]">
        {/* Section nav */}
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-8 lg:flex-col lg:self-start"
        >
          {SECTIONS.map((s) => {
            const isActive = active === s.id;
            const sectionDirty =
              (s.id === "vm-defaults" && dirtyVm) ||
              (s.id === "preferences" && dirtyPrefs);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                aria-current={isActive ? "location" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 whitespace-nowrap border-l-2 px-3 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
                {sectionDirty && (
                  <span
                    aria-label="unsaved changes"
                    className="h-1.5 w-1.5 bg-warning"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="max-w-3xl space-y-12 pb-24">
          {loadError}

          {/* ---------------- Account ---------------- */}
          <Section
            id="account"
            title="Account"
            description="Who you are signed in as."
          >
            <Row label="Username">
              <span className="font-mono text-base">{user.user}</span>
            </Row>
            <Row label="Role">
              {admin ? (
                <span>
                  Administrator
                  <span className="text-muted-foreground"> · full access</span>
                </span>
              ) : (
                <span>
                  Standard user
                  <span className="text-muted-foreground">
                    {" "}
                    · {user.policies.length} permission
                    {user.policies.length === 1 ? "" : "s"}
                  </span>
                </span>
              )}
            </Row>
            <Row label="Created">
              <span className="font-mono text-sm">
                {formatDateOnly(user.created_at, effectiveTimezone)}
              </span>
              {user.created_by && (
                <span className="text-sm text-muted-foreground">
                  {" "}
                  by {user.created_by}
                </span>
              )}
            </Row>
            {user.last_activity && (
              <Row label="Last activity">
                <span className="font-mono text-sm">
                  {formatDateTime(user.last_activity, effectiveTimezone)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  · {formatRelative(user.last_activity)}
                </span>
              </Row>
            )}
            <Row
              label="Password"
              help={
                canChangePassword
                  ? "You will need your current password."
                  : "Changing it needs the auth:changePassword policy."
              }
            >
              <Button
                variant="outline"
                size="sm"
                disabled={!canChangePassword}
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Change password…
              </Button>
            </Row>
          </Section>

          {/* ---------------- Permissions ---------------- */}
          <Section
            id="permissions"
            title="Permissions"
            description="What this account may do. Only an administrator can change these."
          >
            <PermissionsSummary user={user} />
          </Section>

          {/* ---------------- VM defaults ---------------- */}
          <Section
            id="vm-defaults"
            title="VM defaults"
            description="Pre-filled when you provision a VM. You can still change them per VM. System default means whatever the master is configured with."
            dirty={dirtyVm}
          >
            <Row label="vCPUs" htmlFor="default-vcpus">
              <DefaultNumberField
                id="default-vcpus"
                value={draft.vcpus}
                onChange={(v) => patch({ vcpus: v })}
                min={1}
                max={64}
                unit="vCPU"
                fallback={2}
              />
            </Row>
            <Row label="Memory" htmlFor="default-mem">
              <DefaultNumberField
                id="default-mem"
                value={draft.mem}
                onChange={(v) => patch({ mem: v })}
                min={1}
                max={512}
                unit="GB"
                fallback={4}
              />
            </Row>
            <Row label="Disk" htmlFor="default-disk">
              <DefaultNumberField
                id="default-disk"
                value={draft.disk}
                onChange={(v) => patch({ disk: v })}
                min={1}
                max={4000}
                step={5}
                unit="GB"
                fallback={20}
              />
            </Row>
            <Row
              label="Image"
              help={
                canReadImages
                  ? "The OS image selected by default."
                  : "Browsing images needs the images:get policy."
              }
              stacked={imagePickerOpen && canReadImages}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className={cn(
                    "font-mono text-sm",
                    !draft.os && "text-muted-foreground",
                  )}
                >
                  {draft.os || "System default"}
                </span>
                {canReadImages && (
                  <span className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setImagePickerOpen((v) => !v)}
                      aria-expanded={imagePickerOpen}
                    >
                      {imagePickerOpen ? "Close picker" : "Change…"}
                    </Button>
                    {draft.os && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patch({ os: "" })}
                      >
                        Use system default
                      </Button>
                    )}
                  </span>
                )}
              </div>
              {imagePickerOpen && canReadImages && (
                <div className="mt-3">
                  <VMImageSelect
                    selectedOS={draft.os}
                    setSelectedOS={(value) => {
                      patch({ os: value });
                      setImagePickerOpen(false);
                    }}
                    enabled={canReadImages}
                  />
                </div>
              )}
            </Row>
            <Row
              label="Keyboard layout"
              help="Sent to the VM console so keys map correctly."
              htmlFor="default-keyboard"
            >
              <Select
                value={draft.keyboard || KEYBOARD_NONE}
                onValueChange={(v) =>
                  patch({ keyboard: v === KEYBOARD_NONE ? "" : v })
                }
              >
                <SelectTrigger
                  id="default-keyboard"
                  className="w-full max-w-sm"
                >
                  <SelectValue>{keyboardLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KEYBOARD_LAYOUTS.map((kb) => (
                    <SelectItem
                      key={kb.value || KEYBOARD_NONE}
                      value={kb.value || KEYBOARD_NONE}
                    >
                      {kb.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </Section>

          {/* ---------------- Preferences ---------------- */}
          <Section
            id="preferences"
            title="Preferences"
            description="How the dashboard presents things to you."
            dirty={dirtyPrefs}
          >
            <Row
              label="Timezone"
              help="Event schedules and every timestamp are shown in this zone."
              htmlFor="timezone"
            >
              <div className="max-w-sm">
                <TimezoneCombobox
                  id="timezone"
                  value={draft.timezone}
                  onChange={(tz) => patch({ timezone: tz })}
                />
              </div>
            </Row>
          </Section>
        </div>
      </div>

      {/* Save bar */}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none sticky bottom-0 z-10 -mx-8 -mb-8 px-8 pb-6 transition-opacity",
          dirty ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-4 border border-warning/50 bg-background/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur",
            dirty && "pointer-events-auto",
          )}
        >
          <p className="text-sm">
            <span className="text-warning">Unsaved changes</span>
            <span className="text-muted-foreground">
              {" "}
              in{" "}
              {[dirtyVm && "VM defaults", dirtyPrefs && "Preferences"]
                .filter(Boolean)
                .join(" and ")}
              . <kbd className="font-mono text-xs">Ctrl S</kbd> also saves.
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={discard}
              disabled={updateSettings.isPending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}
