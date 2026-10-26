import { useMemo, useState } from "react";
import {
  CheckIcon,
  CloudIcon,
  HardDriveIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useImages } from "@/hooks/useImages";
import { cn } from "~/lib/utils";
import { DistroLogo } from "@/components/distro-logo";
import { Policy, type ImageMetadata } from "~/lib/types";
import { useAuthz } from "@/contexts/authz-context";
import { UploadImageDialog } from "@/components/dashboard/upload-image-dialog";
import { titleOfImage } from "@/components/dashboard/provision/model";

interface VMImageSelectProps {
  selectedOS: string;
  setSelectedOS: (value: string, distribution?: string) => void;
  enabled?: boolean;
}

const TILE_BASE =
  "relative flex min-h-[4.5rem] w-full min-w-0 items-center gap-3 border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function ImageTile({
  image,
  selected,
  onSelect,
}: {
  image: ImageMetadata;
  selected: boolean;
  onSelect: () => void;
}) {
  const { title, subtitle } = titleOfImage(image);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={image.image}
      onClick={onSelect}
      className={cn(
        TILE_BASE,
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-foreground/30",
      )}
    >
      <DistroLogo distribution={image.distribution} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5">
          {title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className="truncate">{subtitle}</span>
          {image.firmware === "efi" && (
            <span className="shrink-0 border border-border px-1 text-[10px] leading-4 text-foreground/70">
              UEFI
            </span>
          )}
        </span>
      </span>
      {selected && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center bg-primary text-primary-foreground">
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function UploadTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        TILE_BASE,
        "border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-dashed border-current/50">
        <UploadIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5">
          Upload an image
        </span>
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
          qcow2, vmdk, vdi, raw, zip
        </span>
      </span>
    </button>
  );
}

function SkeletonTiles() {
  return (
    <div
      className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading images"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[4.5rem] items-center gap-3 border border-border p-3"
        >
          <div className="h-9 w-9 animate-pulse bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="h-2.5 w-16 animate-pulse bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Notice({
  icon,
  title,
  children,
  tone = "muted",
  action,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  tone?: "muted" | "error";
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 border border-dashed p-5 sm:flex-row sm:items-center",
        tone === "error" ? "border-destructive/50" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center border",
          tone === "error"
            ? "border-destructive/50 text-destructive"
            : "border-border text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {children && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {children}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function ImageGrid({
  images,
  selectedOS,
  setSelectedOS,
  onUpload,
}: {
  images: ImageMetadata[];
  selectedOS: string;
  setSelectedOS: (value: string, distribution?: string) => void;
  onUpload?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeFamily, setActiveFamily] = useState("all");

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of images) {
      counts.set(img.family, (counts.get(img.family) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [images]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return images.filter((img) => {
      if (activeFamily !== "all" && img.family !== activeFamily) return false;
      if (!q) return true;
      return [img.distribution, img.version, img.name, img.image, img.family]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [images, search, activeFamily]);

  const chip = (active: boolean) =>
    cn(
      "h-7 shrink-0 border px-2.5 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex h-8 w-full items-center gap-2 border border-input bg-background px-3 focus-within:border-ring sm:w-56">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search images"
            aria-label="Search images"
            autoComplete="off"
            spellCheck={false}
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Image family"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeFamily === "all"}
            className={chip(activeFamily === "all")}
            onClick={() => setActiveFamily("all")}
          >
            all {images.length}
          </button>
          {families.map(([family, count]) => (
            <button
              key={family}
              type="button"
              role="tab"
              aria-selected={activeFamily === family}
              className={chip(activeFamily === family)}
              onClick={() => setActiveFamily(family)}
            >
              {family} {count}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Notice icon={<HardDriveIcon className="h-4 w-4" />} title="No image matches">
          Try another word, or clear the family filter.
        </Notice>
      ) : (
        <div
          role="radiogroup"
          aria-label="Image"
          className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3"
        >
          {filtered.map((image) => (
            <ImageTile
              key={image.image}
              image={image}
              selected={selectedOS === image.image}
              onSelect={() => setSelectedOS(image.image, image.distribution)}
            />
          ))}
          {onUpload && <UploadTile onClick={onUpload} />}
        </div>
      )}
    </div>
  );
}

export function VMImageSelect({
  selectedOS,
  setSelectedOS,
  enabled = true,
}: VMImageSelectProps) {
  const { data: images, isLoading, error } = useImages(enabled);
  const authz = useAuthz();
  const canUpload = authz.hasPolicy(Policy.IMAGES_UPLOAD);
  const [uploadOpen, setUploadOpen] = useState(false);
  const openUpload = canUpload ? () => setUploadOpen(true) : undefined;

  const uploadAction = openUpload ? (
    <button
      type="button"
      onClick={openUpload}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-border px-3 text-xs font-medium hover:border-primary/60 hover:text-foreground"
    >
      <UploadIcon className="h-3.5 w-3.5" />
      Upload an image
    </button>
  ) : undefined;

  let content: React.ReactNode;
  if (isLoading) {
    content = <SkeletonTiles />;
  } else if (error || !images) {
    content = (
      <Notice
        tone="error"
        icon={<XIcon className="h-4 w-4" />}
        title="Images could not be loaded"
        action={uploadAction}
      >
        {error?.message || "Unknown error"}. If this is the public registry,
        try again in a moment. If it is your own bucket, check that the host
        can reach it and that it contains qcow2 images.
      </Notice>
    );
  } else if (images.length === 0) {
    content = (
      <Notice
        icon={<CloudIcon className="h-4 w-4" />}
        title="No images yet"
        action={uploadAction}
      >
        The registry is empty and nothing has been uploaded on this host.
      </Notice>
    );
  } else {
    content = (
      <ImageGrid
        images={images}
        selectedOS={selectedOS}
        setSelectedOS={setSelectedOS}
        onUpload={openUpload}
      />
    );
  }

  return (
    <>
      {content}
      {canUpload && (
        <UploadImageDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={(image) => setSelectedOS(image.image, image.distribution)}
        />
      )}
    </>
  );
}
