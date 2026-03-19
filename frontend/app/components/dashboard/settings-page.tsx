import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Keyboard,
  Globe,
  Server,
  LoaderCircle,
  CheckIcon,
  User as UserIcon,
  Shield,
  CloudUpload,
  Check,
} from "lucide-react";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAuthz } from "@/contexts/authz-context";
import { VMImageSelect } from "@/components/dashboard/vm-image-picker";
import { Policy } from "@/lib/types";
import { PolicyBadge } from "@/components/dashboard/policy-badge";
import { isAdmin } from "@/lib/is-admin";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KEYBOARD_LAYOUTS } from "@/lib/keyboard-layouts";

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    if (offsetPart) {
      return offsetPart.value.replace("GMT", "UTC");
    }
    return "";
  } catch {
    return "";
  }
}

const COMMON_TIMEZONES = [
  "auto",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Bucharest",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

type SaveStatus = "idle" | "saving" | "saved";

export default function SettingsPage() {
  const authz = useAuthz();
  const { user } = authz;
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [vcpus, setVcpus] = useState("");
  const [mem, setMem] = useState("");
  const [diskSize, setDiskSize] = useState("");
  const [selectedOS, setSelectedOS] = useState("");
  const [keyboardLayout, setKeyboardLayout] = useState("");
  const [timezone, setTimezone] = useState("auto");
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [keyboardSearch, setKeyboardSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const canReadImages = authz.hasPolicy(Policy.IMAGES_GET);

  const initialized = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (settings && !initialized.current) {
      setVcpus(settings.default_vcpus?.toString() ?? "");
      setMem(settings.default_mem?.toString() ?? "");
      setDiskSize(settings.default_disk_size?.toString() ?? "");
      setSelectedOS(settings.default_os ?? "");
      setKeyboardLayout(settings.default_keyboard_layout ?? "");
      setTimezone(settings.timezone ?? "auto");
      initialized.current = true;
    }
  }, [settings]);

  const doSave = useCallback(
    async (payload: {
      vcpus: string;
      mem: string;
      diskSize: string;
      selectedOS: string;
      keyboardLayout: string;
      timezone: string;
    }) => {
      setSaveStatus("saving");
      try {
        await updateSettings.mutateAsync({
          default_vcpus: payload.vcpus ? Number.parseInt(payload.vcpus) : 0,
          default_mem: payload.mem ? Number.parseInt(payload.mem) : 0,
          default_disk_size: payload.diskSize
            ? Number.parseInt(payload.diskSize)
            : 0,
          default_os: payload.selectedOS || "",
          default_keyboard_layout: payload.keyboardLayout || "",
          timezone: payload.timezone || "auto",
        });
        setSaveStatus("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("idle");
        toast.error("Failed to save settings");
      }
    },
    [updateSettings],
  );

  useEffect(() => {
    if (!initialized.current || !settings) return;
    const hasChanges =
      vcpus !== (settings.default_vcpus?.toString() ?? "") ||
      mem !== (settings.default_mem?.toString() ?? "") ||
      diskSize !== (settings.default_disk_size?.toString() ?? "") ||
      selectedOS !== (settings.default_os ?? "") ||
      keyboardLayout !== (settings.default_keyboard_layout ?? "") ||
      timezone !== (settings.timezone ?? "auto");

    if (!hasChanges) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      doSave({ vcpus, mem, diskSize, selectedOS, keyboardLayout, timezone });
    }, 600);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [
    vcpus,
    mem,
    diskSize,
    selectedOS,
    keyboardLayout,
    timezone,
    settings,
    doSave,
  ]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const filteredTimezones = COMMON_TIMEZONES.filter((tz) =>
    tz.toLowerCase().includes(timezoneSearch.toLowerCase()),
  );

  const filteredKeyboards = KEYBOARD_LAYOUTS.filter((kb) =>
    kb.label.toLowerCase().includes(keyboardSearch.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-2 font-mono text-3xl font-bold tracking-tight">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your account preferences and default configurations
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 animate-in fade-in">
              <CloudUpload className="h-4 w-4 animate-pulse" />
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-emerald-400 animate-in fade-in">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6 pb-8">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-primary" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-muted-foreground">
                    Username
                  </p>
                  <p className="font-mono text-lg font-semibold">
                    {user?.user}
                  </p>
                </div>
                {isAdmin(user) && (
                  <Badge
                    variant="secondary"
                    className="border border-purple-500/40 bg-purple-500/15 text-purple-400"
                  >
                    Administrator
                  </Badge>
                )}
              </div>

              {user?.created_at && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-muted-foreground">
                      Account created
                    </p>
                    <p className="text-sm">
                      {new Date(user.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  {user.created_by && (
                    <p className="text-xs text-muted-foreground">
                      by {user.created_by}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Policies
            </CardTitle>
            <CardDescription>
              Permissions assigned to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user?.policies && user.policies.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.policies.map((p) => (
                  <PolicyBadge
                    key={p.policy}
                    policy={p.policy}
                    description={p.description}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No policies assigned
              </p>
            )}
          </CardContent>
        </Card>

        <Separator />

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              Default VM Resources
            </CardTitle>
            <CardDescription>
              Pre-fill values when provisioning new virtual machines. Leave
              empty to use system defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label
                  htmlFor="default-vcpus"
                  className="flex items-center gap-2"
                >
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  Virtual CPUs
                </Label>
                <Input
                  id="default-vcpus"
                  type="number"
                  min="1"
                  placeholder="e.g., 2"
                  value={vcpus}
                  onChange={(e) => setVcpus(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Number of virtual CPU cores
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="default-mem"
                  className="flex items-center gap-2"
                >
                  <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  Memory (GB)
                </Label>
                <Input
                  id="default-mem"
                  type="number"
                  min="1"
                  placeholder="e.g., 4"
                  value={mem}
                  onChange={(e) => setMem(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  RAM allocation in gigabytes
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="default-disk"
                  className="flex items-center gap-2"
                >
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  Disk Size (GB)
                </Label>
                <Input
                  id="default-disk"
                  type="number"
                  min="1"
                  placeholder="e.g., 20"
                  value={diskSize}
                  onChange={(e) => setDiskSize(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Disk storage in gigabytes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Default Operating System
            </CardTitle>
            <CardDescription>
              Pre-select an OS image when provisioning new VMs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canReadImages ? (
              <div className="space-y-3">
                {selectedOS && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Currently selected:{" "}
                      <span className="font-mono text-foreground">
                        {selectedOS}
                      </span>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedOS("")}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
                <VMImageSelect
                  selectedOS={selectedOS}
                  setSelectedOS={(value) => setSelectedOS(value)}
                  enabled={canReadImages}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You need the <span className="font-mono">images:get</span>{" "}
                policy to browse available images.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" />
              Default Keyboard Layout
            </CardTitle>
            <CardDescription>
              Keyboard layout used for VM console connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
                <Keyboard className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  placeholder="Search keyboard layouts..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  value={keyboardSearch}
                  onChange={(e) => setKeyboardSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="h-56">
                <div className="space-y-0.5 p-1.5">
                  {filteredKeyboards.map((kb) => (
                    <button
                      key={kb.value}
                      type="button"
                      onClick={() => setKeyboardLayout(kb.value)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        keyboardLayout === kb.value
                          ? "border border-primary/40 bg-primary/10 text-foreground"
                          : "border border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      <span>{kb.label}</span>
                      {keyboardLayout === kb.value && (
                        <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                  {filteredKeyboards.length === 0 && (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No keyboard layouts match your search.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Timezone
            </CardTitle>
            <CardDescription>
              Used for event scheduling and time display.{" "}
              <span className="font-medium text-foreground">Auto</span> uses
              your browser's timezone
              {timezone === "auto" && (
                <span className="text-muted-foreground">
                  {" "}
                  (currently {getBrowserTimezone()},{" "}
                  {getUtcOffset(getBrowserTimezone())})
                </span>
              )}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  placeholder="Search timezones..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  value={timezoneSearch}
                  onChange={(e) => setTimezoneSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="h-56">
                <div className="space-y-0.5 p-1.5">
                  {filteredTimezones.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onClick={() => setTimezone(tz)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        timezone === tz
                          ? "border border-primary/40 bg-primary/10 text-foreground"
                          : "border border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {tz === "auto" ? (
                          <>
                            Auto{" "}
                            <span className="text-xs text-muted-foreground">
                              ({getBrowserTimezone()},{" "}
                              {getUtcOffset(getBrowserTimezone())})
                            </span>
                          </>
                        ) : (
                          <>
                            {tz.replace(/_/g, " ")}
                            <span className="text-xs font-mono text-muted-foreground">
                              {getUtcOffset(tz)}
                            </span>
                          </>
                        )}
                      </span>
                      {timezone === tz && (
                        <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                  {filteredTimezones.length === 0 && (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No timezones match your search.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
