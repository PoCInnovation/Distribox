import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useImageUploads } from "@/hooks/useImages";
import {
  cancelImageUpload,
  detachImageUpload,
  dismissImageUploads,
  startImageUpload,
} from "@/lib/image-uploads";
import type { ImageMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCEPTED_FILES = ".qcow2,.vmdk,.vdi,.img,.raw,.zip";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Guess distribution and version from a file name like "ubuntu-24.04-server.qcow2". */
function guessFromFilename(filename: string): {
  distribution: string;
  version: string;
} {
  const stem = filename.replace(/\.[^.]+$/, "").toLowerCase();
  const known = [
    ["ubuntu", "Ubuntu"],
    ["debian", "Debian"],
    ["fedora", "Fedora"],
    ["arch", "Archlinux"],
    ["alpine", "Alpine Linux"],
    ["kali", "Kali Linux"],
    ["alma", "AlmaLinux"],
    ["rocky", "Rocky Linux"],
    ["centos", "CentOS"],
    ["windows", "Windows"],
    ["win", "Windows"],
    ["freebsd", "FreeBSD"],
  ] as const;
  const distribution =
    known.find(([needle]) => stem.includes(needle))?.[1] ?? "";
  const version = stem.match(/\d+(?:\.\d+)*/)?.[0] ?? "";
  return { distribution, version };
}

interface UploadImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (image: ImageMetadata) => void;
}

export function UploadImageDialog({
  open,
  onOpenChange,
  onUploaded,
}: UploadImageDialogProps) {
  const ids = useId();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [distribution, setDistribution] = useState("");
  const [version, setVersion] = useState("");
  const [efi, setEfi] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const upload = useImageUploads().find((u) => u.id === uploadId);
  const pending = upload?.status === "running";
  // Converting and setting up SSH can't be stopped.
  const processing = pending && upload.phase !== "uploading";
  const progress = upload?.fileSize
    ? Math.floor((upload.bytesSent / upload.fileSize) * 100)
    : 0;

  // Closing or leaving the page hands a running upload to the Activity bar.
  useEffect(() => {
    if (!uploadId) return;
    return () => detachImageUpload(uploadId);
  }, [uploadId]);

  const reset = () => {
    if (upload?.status === "failed") dismissImageUploads([upload.id]);
    setUploadId(null);
    setFile(null);
    setName("");
    setDistribution("");
    setVersion("");
    setEfi(false);
    setSubmitted(false);
    setDragging(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const uploaded = upload?.status === "succeeded" ? upload.image : null;
  useEffect(() => {
    if (!uploaded) return;
    onUploaded(uploaded);
    handleOpenChange(false);
    // Runs once per finished upload; the handlers are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploaded]);

  const pickFile = (selected: File | null) => {
    setFile(selected);
    if (!selected) return;
    if (!name) setName(selected.name.replace(/\.[^.]+$/, ""));
    const guess = guessFromFilename(selected.name);
    if (!distribution && guess.distribution)
      setDistribution(guess.distribution);
    if (!version && guess.version) setVersion(guess.version);
    if (/\.(vmdk|vdi)$/i.test(selected.name)) setEfi(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The dialog is portalled from inside other forms, and React bubbles
    // submit events through portals to them.
    e.stopPropagation();
    setSubmitted(true);
    if (!file || !name.trim()) return;
    if (upload?.status === "failed") dismissImageUploads([upload.id]);
    setUploadId(
      startImageUpload(
        file,
        {
          name: name.trim(),
          distribution: distribution.trim(),
          version: version.trim(),
          firmware: efi ? "efi" : "bios",
        },
        queryClient,
      ),
    );
  };

  const nameMissing = submitted && !name.trim();
  const fileMissing = submitted && !file;
  const status =
    upload?.phase === "preparing"
      ? "Setting up SSH on the image."
      : upload?.phase === "converting"
        ? "Converting to qcow2. This can take a few minutes."
        : `Uploading, ${progress}%`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-mono">Upload an image</DialogTitle>
          <DialogDescription>
            Add a disk image to this host. VMDK, VDI and raw disks are converted
            to qcow2. A zip archive containing one disk works too.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-file`}>Disk image</Label>
            <input
              ref={fileInput}
              id={`${ids}-file`}
              type="file"
              accept={ACCEPTED_FILES}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              disabled={pending}
            />
            {file ? (
              <div className="flex items-center gap-3 border border-border p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm">
                    {file.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </span>
                {!pending && (
                  <button
                    type="button"
                    aria-label="Remove file"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 border border-dashed px-4 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  dragging
                    ? "border-primary bg-primary/5"
                    : fileMissing
                      ? "border-destructive"
                      : "border-border hover:border-primary/60",
                )}
              >
                <UploadIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">
                  Drop a disk here or{" "}
                  <span className="text-primary underline underline-offset-4">
                    browse
                  </span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  qcow2, vmdk, vdi, img, raw, zip
                </span>
              </button>
            )}
            {fileMissing && (
              <p className="text-xs text-destructive">
                Choose a disk image first.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-name`}>Name</Label>
            <Input
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Networking lab VM"
              autoComplete="off"
              aria-invalid={nameMissing || undefined}
              disabled={pending}
            />
            {nameMissing && (
              <p className="text-xs text-destructive">
                The image needs a name.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${ids}-distribution`}>Distribution</Label>
              <Input
                id={`${ids}-distribution`}
                value={distribution}
                onChange={(e) => setDistribution(e.target.value)}
                placeholder="Ubuntu"
                autoComplete="off"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${ids}-version`}>Version</Label>
              <Input
                id={`${ids}-version`}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="24.04"
                autoComplete="off"
                className="font-mono"
                disabled={pending}
              />
            </div>
          </div>
          <label
            htmlFor={`${ids}-efi`}
            className="flex cursor-pointer items-start gap-3 border border-border p-3"
          >
            <Checkbox
              id={`${ids}-efi`}
              checked={efi}
              onCheckedChange={(checked) => setEfi(checked === true)}
              disabled={pending}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">Boot with UEFI</span>
              <span className="block text-xs text-muted-foreground">
                Needed for VirtualBox or VMware EFI exports and Windows disks.
              </span>
            </span>
          </label>

          {pending && (
            <div className="grid gap-2" aria-live="polite">
              <Progress value={progress} className="rounded-none" />
              <p className="font-mono text-xs text-muted-foreground">
                {status}
              </p>
            </div>
          )}
          {upload?.status === "failed" && (
            <p
              role="alert"
              className="border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {upload.error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (upload) cancelImageUpload(upload.id);
                handleOpenChange(false);
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading" : "Upload image"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
