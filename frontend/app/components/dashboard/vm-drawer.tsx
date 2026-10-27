import { useEffect, useState } from "react";
import { ExternalLink, Keyboard, Monitor, MonitorOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getVmScreenshotUrl } from "@/lib/api/vms";
import { Policy, VMState, type VirtualMachineMetadata } from "@/lib/types";
import { getKeyboardLabel } from "@/lib/keyboard-layouts";
import { getStateUi } from "@/lib/vm-state-ui";
import { useAuthz } from "@/contexts/authz-context";
import { useVmActions } from "@/hooks/useVmActions";
import { DistroLogo } from "@/components/distro-logo";
import { cn } from "@/lib/utils";
import { VmStatus } from "./vm-status";
import { VmActionToolbar } from "./vm-action-toolbar";
import { CopyText } from "./copy-text";
import { useOsInfo } from "./vm-os-label";
import { VmAccessSection } from "./vm-access-section";
import { hostLabel } from "./vms-table";

const SCREENSHOT_POLL_MS = 3000;

interface VmDrawerProps {
  vm: VirtualMachineMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VmDrawer({ vm, open, onOpenChange }: VmDrawerProps) {
  const [tab, setTab] = useState<"overview" | "access">("overview");

  // Reset to Overview when a different VM opens.
  useEffect(() => {
    if (open) setTab("overview");
  }, [open, vm?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[600px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {vm ? (
          <DrawerBody vm={vm} tab={tab} onTabChange={setTab} />
        ) : (
          <div className="p-6">
            <SheetTitle>Virtual machine</SheetTitle>
            <SheetDescription>Not found.</SheetDescription>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  vm,
  tab,
  onTabChange,
}: {
  vm: VirtualMachineMetadata;
  tab: "overview" | "access";
  onTabChange: (t: "overview" | "access") => void;
}) {
  const os = useOsInfo(vm.os);
  const { pendingOp } = useVmActions(vm);
  const shortId = `${vm.id.slice(0, 8)}…${vm.id.slice(-4)}`;

  return (
    <>
      <header className="border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-start gap-4 pr-8">
          <DistroLogo
            distribution={os.distribution}
            className="size-12 border border-border bg-secondary [&_img]:size-6"
          />
          <div className="min-w-0 flex-1">
            <SheetTitle
              className="truncate font-mono text-xl font-semibold tracking-tight"
              title={vm.name}
            >
              {vm.name}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <VmStatus vm={vm} pendingOp={pendingOp} />
                <span className="text-border">|</span>
                <span className="text-muted-foreground">{os.label}</span>
                <span className="text-border">|</span>
                <span className="text-muted-foreground">
                  on {hostLabel(vm)}
                </span>
              </div>
            </SheetDescription>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>id</span>
              <CopyText
                value={vm.id}
                display={shortId}
                label="VM id"
                className="text-xs text-muted-foreground hover:text-primary"
              />
            </div>
          </div>
        </div>
        <VmActionToolbar vm={vm} className="mt-5" />
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v as "overview" | "access")}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent px-6 py-0">
          {(
            [
              ["overview", "Overview"],
              ["access", "Access"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-0 text-sm text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {label}
              {value === "access" && (
                <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                  {vm.credentials_count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="overview" className="m-0 space-y-6 p-6">
            <ScreenPreview vm={vm} />
            <SpecGrid vm={vm} osLabel={os.label} osImage={os.image} />
          </TabsContent>
          <TabsContent value="access" className="m-0 p-6">
            <VmAccessSection vm={vm} active={tab === "access"} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

function ScreenPreview({ vm }: { vm: VirtualMachineMetadata }) {
  const authz = useAuthz();
  const { byId } = useVmActions(vm);
  const allowed = authz.hasPolicy(Policy.VMS_SCREENSHOT);
  const running = vm.state === VMState.RUNNING;
  const stateUi = getStateUi(vm.state);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!allowed || !running) {
      setSrc(null);
      setFailed(false);
      return;
    }
    const refresh = () =>
      setSrc(`${getVmScreenshotUrl(vm.id)}&t=${Date.now()}`);
    refresh();
    const id = window.setInterval(refresh, SCREENSHOT_POLL_MS);
    return () => window.clearInterval(id);
  }, [vm.id, running, allowed]);

  if (!allowed) return null;

  const openable = byId.connect.enabled;

  if (!running) {
    const hint =
      vm.state === VMState.STOPPED
        ? "Powered off. Start it to see its screen here."
        : stateUi.transitional
          ? `${stateUi.label}… the screen comes back once the VM settles.`
          : `${stateUi.label}. No live screen while in this state.`;
    return (
      <div className="flex items-center gap-3 border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <MonitorOff className="size-4 shrink-0" />
        <span>{hint}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Screen</span>
        {!failed && <span>Refreshes every 3 s</span>}
      </div>
      <button
        type="button"
        onClick={() => openable && byId.connect.run()}
        disabled={!openable}
        aria-label={openable ? "Open console" : "Console unavailable"}
        className={cn(
          "group/screen relative block aspect-[16/10] w-full overflow-hidden border border-border bg-black text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          openable ? "cursor-pointer" : "cursor-default",
        )}
      >
        {src && !failed ? (
          <img
            src={src}
            alt={`${vm.name} screen`}
            className="size-full object-contain"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Monitor className="size-7" />
            <span className="text-xs">
              {failed ? "Screen capture unavailable" : "Loading screen…"}
            </span>
          </div>
        )}
        {openable && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/screen:opacity-100 group-focus-visible/screen:opacity-100">
            <span className="inline-flex items-center gap-2 bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              <ExternalLink className="size-4" />
              Open console
            </span>
          </span>
        )}
      </button>
    </div>
  );
}

function SpecGrid({
  vm,
  osLabel,
  osImage,
}: {
  vm: VirtualMachineMetadata;
  osLabel: string;
  osImage: string;
}) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] border border-border text-sm [&>dd]:border-b [&>dd]:border-border [&>dt]:border-r [&>dt]:border-b [&>dt]:border-border [&>dd:last-of-type]:border-b-0 [&>dt:last-of-type]:border-b-0">
      <Spec label="Operating system">
        <span className="block">{osLabel}</span>
        <span
          className="block truncate font-mono text-xs text-muted-foreground"
          title={osImage}
        >
          {osImage}
        </span>
      </Spec>
      <Spec label="Compute">
        <span className="font-mono tabular-nums">
          {vm.vcpus} vCPU
          <span className="mx-2 text-border">/</span>
          {vm.mem} GB memory
          <span className="mx-2 text-border">/</span>
          {vm.disk_size} GB disk
        </span>
      </Spec>
      <Spec label="IP address">
        {vm.ipv4 ? (
          <CopyText value={vm.ipv4} label="IP address" />
        ) : (
          <span className="text-muted-foreground">
            {vm.state === VMState.RUNNING
              ? "Waiting for a lease"
              : "None while powered off"}
          </span>
        )}
      </Spec>
      <Spec label="Host">{hostLabel(vm)}</Spec>
      <Spec label="Keyboard">
        <span className="inline-flex items-center gap-2">
          <Keyboard className="size-3.5 text-muted-foreground" />
          {vm.keyboard_layout
            ? getKeyboardLabel(vm.keyboard_layout)
            : "VM default"}
        </span>
      </Spec>
      <Spec label="VM id">
        <CopyText value={vm.id} label="VM id" className="text-xs" />
      </Spec>
    </dl>
  );
}

function Spec({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="px-4 py-2.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 px-4 py-2.5">{children}</dd>
    </>
  );
}
