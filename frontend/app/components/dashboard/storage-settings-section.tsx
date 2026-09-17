import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, LoaderCircle, Pencil, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthz } from "@/contexts/authz-context";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { getSlaves } from "@/lib/api/slaves";
import {
  Policy,
  type StorageLocation,
  type StorageLocationUpdate,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function StorageLocationRow({
  location,
  canManage,
  pending,
  onUpdate,
}: {
  location: StorageLocation;
  canManage: boolean;
  pending: boolean;
  onUpdate: (update: StorageLocationUpdate) => Promise<unknown>;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(location.name);
  const editable = canManage && location.managed;

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0 flex-1 space-y-1">
          {editing ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!name.trim() || pending) return;
                try {
                  await onUpdate({ name: name.trim() });
                  setEditing(false);
                } catch {
                  // Keep the entered name so the user can retry after the error.
                }
              }}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`${id}-name`}>Location name</Label>
                <Input
                  id={`${id}-name`}
                  value={name}
                  maxLength={80}
                  autoFocus
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !name.trim()}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-sm font-medium">
                {location.name}
              </h4>
              {location.id === "default" && (
                <Badge variant="secondary">Default</Badge>
              )}
              {!location.enabled && (
                <Badge variant="outline">Disabled for new VMs</Badge>
              )}
              {editable && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Rename ${location.name}`}
                  disabled={pending}
                  onClick={() => {
                    setName(location.name);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          <p className="break-all font-mono text-xs text-muted-foreground">
            {location.path}
          </p>
          {location.available ? (
            <p className="text-sm text-muted-foreground">
              <span className="tabular-nums text-foreground">
                {location.available_gib.toFixed(1)} GiB free
              </span>{" "}
              of {location.total_gib.toFixed(1)} GiB
            </p>
          ) : (
            <p className="text-sm text-destructive">
              {location.reason ?? "Storage is unavailable"}
            </p>
          )}
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-3 pt-1">
            <Label htmlFor={`${id}-enabled`} className="text-xs">
              Use for new VMs
            </Label>
            <button
              id={`${id}-enabled`}
              type="button"
              role="switch"
              aria-label={`Use ${location.name} for new VMs`}
              aria-checked={location.enabled}
              disabled={pending}
              onClick={() =>
                void onUpdate({ enabled: !location.enabled }).catch(
                  () => undefined,
                )
              }
              className={cn(
                "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                location.enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full bg-foreground transition-transform",
                  location.enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function StorageNodeSettings({
  slaveId,
  nodeName,
  canManage,
}: {
  slaveId: string | null;
  nodeName: string;
  canManage: boolean;
}) {
  const { query, change } = useStorageSettings(slaveId, nodeName);
  const candidates =
    query.data?.candidates.filter(
      (candidate) => candidate.configured_storage_id === null,
    ) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Storage on {nodeName}</h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={query.isFetching || change.isPending}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      </div>
      {query.isPending ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking mounted partitions...
        </p>
      ) : query.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Could not load storage on {nodeName}. {query.error.message}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry storage settings
          </Button>
        </div>
      ) : (
        <>
          {change.isError && (
            <p role="alert" className="text-sm text-destructive">
              Could not update storage. {change.error.message}
            </p>
          )}
          {change.isPending && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {change.variables.type === "add"
                ? "Adding storage..."
                : "Saving storage..."}
            </p>
          )}
          <div className="space-y-2">
            {query.data.locations.length > 0 ? (
              <ul className="divide-y divide-border border border-border">
                {query.data.locations.map((location) => (
                  <StorageLocationRow
                    key={location.id}
                    location={location}
                    canManage={canManage}
                    pending={change.isPending}
                    onUpdate={(update) =>
                      change.mutateAsync({
                        type: "update",
                        locationId: location.id,
                        update,
                      })
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No storage locations are configured on this node.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Auto chooses an enabled location with enough space. Disabling a
              location leaves existing VMs and images in place.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">
                {canManage ? "Add storage" : "Mounted partitions"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use free space on an existing partition for VM disks and
                downloaded images. Distribox creates its own folder there.
              </p>
            </div>
            {query.data.discovery_error && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>
                  Could not discover mounted partitions.{" "}
                  {query.data.discovery_error}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={query.isFetching || change.isPending}
                  onClick={() => void query.refetch()}
                >
                  Retry partition discovery
                </Button>
              </div>
            )}
            {candidates.length > 0 ? (
              <ul className="divide-y divide-border border border-border">
                {candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-all font-mono text-sm">
                        {candidate.mount_path}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums text-foreground">
                          {candidate.available_gib.toFixed(1)} GiB free
                        </span>{" "}
                        of {candidate.total_gib.toFixed(1)} GiB (
                        {candidate.filesystem})
                      </p>
                      {!candidate.available && (
                        <p className="text-xs text-destructive">
                          {candidate.reason ?? "This partition is unavailable"}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!candidate.available || change.isPending}
                        aria-label={`Use ${candidate.mount_path} for storage`}
                        onClick={() =>
                          change.mutate({ type: "add", mountId: candidate.id })
                        }
                      >
                        Use this partition
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              !query.data.discovery_error && (
                <p className="text-sm text-muted-foreground">
                  No additional mounted partitions were found. Newly mounted
                  partitions appear after refreshing.
                </p>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function StorageSettingsSection() {
  const authz = useAuthz();
  const canManage = authz.hasPolicy(Policy.STORAGE_MANAGE);
  const canReadSlaves = authz.hasPolicy(Policy.SLAVES_GET);
  const [slaveId, setSlaveId] = useState<string | null>(null);
  useEffect(() => {
    if (window.location.hash === "#storage") {
      document.getElementById("storage")?.scrollIntoView();
    }
  }, []);
  const slaves = useQuery({
    queryKey: ["slaves"],
    queryFn: getSlaves,
    enabled: canReadSlaves,
    retry: false,
  });
  const nodeName =
    slaveId === null
      ? "Master"
      : (slaves.data?.find((slave) => slave.id === slaveId)?.name ??
        "selected node");

  return (
    <Card id="storage" className="scroll-mt-6 border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          Storage
        </CardTitle>
        <CardDescription>
          Choose where this installation stores VM disks and downloaded images.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!canManage && (
          <p className="text-sm text-muted-foreground">
            Your account can view storage but does not have permission to change
            it.
          </p>
        )}
        {canReadSlaves && (slaves.data?.length ?? 0) > 0 && (
          <div className="max-w-sm space-y-2">
            <Label htmlFor="storage-node">Host</Label>
            <Select
              value={slaveId ?? "master"}
              onValueChange={(value) =>
                setSlaveId(value === "master" ? null : value)
              }
            >
              <SelectTrigger id="storage-node" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="master">Master</SelectItem>
                {slaves.data?.map((slave) => (
                  <SelectItem
                    key={slave.id}
                    value={slave.id}
                    disabled={slave.status !== "online"}
                  >
                    {slave.name}
                    {slave.status !== "online" ? " (offline)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {canReadSlaves && slaves.isError && (
          <p role="alert" className="text-sm text-muted-foreground">
            Could not load other hosts.{" "}
            <Button
              type="button"
              size="sm"
              variant="link"
              disabled={slaves.isFetching}
              onClick={() => void slaves.refetch()}
            >
              Retry host list
            </Button>
          </p>
        )}
        <StorageNodeSettings
          key={slaveId ?? "master"}
          slaveId={slaveId}
          nodeName={nodeName}
          canManage={canManage}
        />
      </CardContent>
    </Card>
  );
}
