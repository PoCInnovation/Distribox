import { useState } from "react";
import { toast } from "sonner";
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
import { useUploadImage } from "@/hooks/useImages";
import type { ImageMetadata } from "@/lib/types";

const ACCEPTED_FILES = ".qcow2,.vmdk,.vdi,.img,.raw,.zip";

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
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [distribution, setDistribution] = useState("");
  const [version, setVersion] = useState("");
  const [efi, setEfi] = useState(false);
  const [progress, setProgress] = useState(0);
  const upload = useUploadImage(setProgress);

  const reset = () => {
    setFile(null);
    setName("");
    setDistribution("");
    setVersion("");
    setEfi(false);
    setProgress(0);
    upload.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (upload.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !name) setName(selected.name.replace(/\.[^.]+$/, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    try {
      const image = await upload.mutateAsync({
        file,
        payload: {
          name: name.trim(),
          distribution: distribution.trim(),
          version: version.trim(),
          firmware: efi ? "efi" : "bios",
        },
      });
      toast.success(`Image "${image.name}" is ready`);
      onUploaded(image);
      reset();
      onOpenChange(false);
    } catch {
      setProgress(0);
    }
  };

  const status =
    progress < 100 ? `Uploading... ${progress}%` : "Converting image...";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Upload Image</DialogTitle>
          <DialogDescription>
            Add a disk image to this host. VMDK, VDI and raw disks are converted
            to qcow2. A zip archive containing a disk works too.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="image-file">Disk image</Label>
              <Input
                id="image-file"
                type="file"
                accept={ACCEPTED_FILES}
                onChange={handleFileChange}
                disabled={upload.isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="image-name">Name</Label>
              <Input
                id="image-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Networking Lab VM"
                disabled={upload.isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="image-distribution">Distribution</Label>
                <Input
                  id="image-distribution"
                  value={distribution}
                  onChange={(e) => setDistribution(e.target.value)}
                  placeholder="archlinux"
                  disabled={upload.isPending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image-version">Version</Label>
                <Input
                  id="image-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="rolling"
                  disabled={upload.isPending}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="image-efi"
                checked={efi}
                onCheckedChange={(checked) => setEfi(checked === true)}
                disabled={upload.isPending}
              />
              <label
                htmlFor="image-efi"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                Boot with UEFI firmware (VirtualBox or VMware EFI exports)
              </label>
            </div>
            {upload.isPending && (
              <div className="grid gap-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">{status}</p>
              </div>
            )}
            {upload.isError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {upload.error instanceof Error
                  ? upload.error.message
                  : "Failed to upload image"}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={upload.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!file || !name.trim() || upload.isPending}
            >
              {upload.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
