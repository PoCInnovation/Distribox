import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HostStorage, StorageLocation } from "@/lib/types";

interface StorageLocationSelectProps {
  data: HostStorage | undefined;
  selectedId: string | null;
  location: StorageLocation | undefined;
  onChange: (id: string | null) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function StorageLocationSelect({
  data,
  selectedId,
  location,
  onChange,
  isLoading,
  isFetching,
  error,
  onRetry,
}: StorageLocationSelectProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="storage-location" className="flex items-center gap-2">
        <HardDrive className="h-4 w-4" />
        Storage location
      </Label>
      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking storage locations...
        </p>
      ) : error ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Could not check storage locations. {error.message}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={onRetry}
          >
            {isFetching ? "Checking..." : "Retry storage check"}
          </Button>
        </div>
      ) : (
        <>
          <Select
            value={selectedId === null ? "auto" : `location:${selectedId}`}
            onValueChange={(value) =>
              onChange(
                value === "auto" ? null : value.slice("location:".length),
              )
            }
          >
            <SelectTrigger
              id="storage-location"
              className="w-full"
              aria-describedby="storage-description"
              aria-invalid={!location?.available || !location.enabled}
            >
              <SelectValue>
                {selectedId === null
                  ? "Auto (most free space)"
                  : (location?.name ?? "Selected location unavailable")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem value="auto">Auto (most free space)</SelectItem>
              {data?.locations.map((item) => (
                <SelectItem
                  key={item.id}
                  value={`location:${item.id}`}
                  disabled={!item.available || !item.enabled}
                  textValue={`${item.name} ${item.path}`}
                  className="group"
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5 py-1">
                    <span>{item.name}</span>
                    <span className="break-all text-xs text-muted-foreground group-data-[highlighted]:text-accent-foreground">
                      {item.path}
                    </span>
                    <span className="text-xs text-muted-foreground group-data-[highlighted]:text-accent-foreground">
                      {!item.enabled
                        ? "Disabled for new VMs"
                        : item.available
                          ? `${item.available_gib.toFixed(1)} GiB free of ${item.total_gib.toFixed(1)} GiB`
                          : (item.reason ?? "Unavailable")}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            id="storage-description"
            aria-live="polite"
            className="space-y-1"
          >
            {location?.available && location.enabled ? (
              <>
                <p className="break-all text-sm">
                  {selectedId === null ? "Suggested: " : "Destination: "}
                  <span className="font-mono">{location.path}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {location.available_gib.toFixed(1)} GiB free. VM disks and
                  downloaded images are stored here.
                </p>
                {selectedId === null && (
                  <p className="text-xs text-muted-foreground">
                    Auto checks free space again when creating the VM.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-destructive">
                {selectedId !== null
                  ? location?.enabled === false
                    ? "This location is disabled for new VMs. Choose another location."
                    : (location?.reason ??
                      "This location is no longer available. Choose another location.")
                  : "No storage location is available. Check the host's storage configuration and mounts."}
              </p>
            )}
          </div>
          {data?.locations
            .filter((item) => !item.available)
            .map((item) => (
              <p
                key={item.id}
                className="break-words text-xs text-muted-foreground"
              >
                {item.name}: {item.reason ?? "Unavailable"}
              </p>
            ))}
        </>
      )}
    </div>
  );
}
