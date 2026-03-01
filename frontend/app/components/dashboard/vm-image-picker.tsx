import { useState, useMemo } from "react";
import { useImages } from "@/hooks/useImages";
import { cn } from "~/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  CloudIcon,
  FrownIcon,
  LoaderCircleIcon,
  XIcon,
  SearchIcon,
  HardDriveIcon,
  LayoutGridIcon,
  TerminalIcon,
  MonitorIcon,
  BoxIcon,
  CheckIcon,
} from "lucide-react";
import type { ImageMetadata } from "~/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface VMImageSelectProps {
  selectedOS: string;
  setSelectedOS: (value: string) => void;
  enabled?: boolean;
}

const DISTRO_ICON_SLUGS: Record<string, string> = {
  debian: "debian",
  ubuntu: "ubuntu",
  archlinux: "archlinux",
  fedora: "fedora",
  centos: "centos",
  "red hat enterprise linux": "redhat",
  rhel: "redhat",
  opensuse: "opensuse",
  "alpine linux": "alpinelinux",
  alpine: "alpinelinux",
  manjaro: "manjaro",
  "kali linux": "kalilinux",
  "linux mint": "linuxmint",
  almalinux: "almalinux",
  freebsd: "freebsd",
  openbsd: "openbsd",
  windows: "windows",
  "windows server": "windows",
};

const FAMILY_ICONS: Record<string, React.ReactNode> = {
  All: <LayoutGridIcon className="h-4 w-4 shrink-0" />,
  Linux: <TerminalIcon className="h-4 w-4 shrink-0" />,
  Windows: <MonitorIcon className="h-4 w-4 shrink-0" />,
  BSD: <BoxIcon className="h-4 w-4 shrink-0" />,
};

function getFamilyIcon(family: string): React.ReactNode {
  return FAMILY_ICONS[family] ?? <BoxIcon className="h-4 w-4 shrink-0" />;
}

function DistroLogo({ distribution }: { distribution: string }) {
  const [imgError, setImgError] = useState(false);
  const slug = DISTRO_ICON_SLUGS[distribution.toLowerCase()];

  return (
    <div className="w-9 h-9 flex items-center justify-center rounded-md bg-muted shrink-0">
      {slug && !imgError ? (
        <img
          src={`https://cdn.simpleicons.org/${slug}`}
          alt={distribution}
          className="w-5 h-5"
          onError={() => setImgError(true)}
        />
      ) : (
        <HardDriveIcon className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  );
}

function EmptyVMImageSelect() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CloudIcon />
        </EmptyMedia>
        <EmptyTitle>Cloud Storage Empty</EmptyTitle>
        <EmptyDescription>
          The public registry is empty, or you haven't uploaded any images on
          your personal bucket yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function LoadingVMImageSelect() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LoaderCircleIcon className="h-6 w-6 animate-spin" />
        </EmptyMedia>
        <EmptyTitle>Fetching images...</EmptyTitle>
        <EmptyDescription>
          Please wait while we fetch the distribox images for you. Hang tight!
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ErrorVMImageSelect({ error }: { error: Error | null }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <XIcon className="h-6 w-6 text-destructive" />
        </EmptyMedia>
        <EmptyTitle className="flex space-x-2 text-destructive">
          <span>Failed to fetch images</span>
          <FrownIcon />
        </EmptyTitle>
        <EmptyDescription>
          <span className="text-destructive">
            {error?.message || "Unknown error occurred"}
          </span>
          <br />
          If you are using the public registry, please try again later or
          contact the Distribox team on{" "}
          <a
            href="https://github.com/PoCInnovation/distribox/issues"
            className="text-primary underline"
          >
            GitHub
          </a>{" "}
          if the issue persists. If you are using your own private registry,
          please check that your bucket is accessible from the host machine and
          contains valid qcow2 images.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ImagePicker({
  images,
  selectedOS,
  setSelectedOS,
}: {
  images: ImageMetadata[];
  selectedOS: string;
  setSelectedOS: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeFamily, setActiveFamily] = useState("All");

  const families = useMemo(() => {
    const unique = [...new Set(images.map((img) => img.family))].sort();
    return ["All", ...unique];
  }, [images]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return images.filter((img) => {
      const matchesFamily =
        activeFamily === "All" || img.family === activeFamily;
      const matchesSearch =
        !q ||
        img.distribution.toLowerCase().includes(q) ||
        img.version.toLowerCase().includes(q) ||
        img.name.toLowerCase().includes(q) ||
        img.image.toLowerCase().includes(q);
      return matchesFamily && matchesSearch;
    });
  }, [images, search, activeFamily]);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          placeholder="Search images..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex h-72">
        {/* Left: Family filter sidebar */}
        <div className="border-r flex flex-col py-1 w-32 shrink-0 bg-muted/10">
          {families.map((family) => (
            <button
              key={family}
              type="button"
              onClick={() => setActiveFamily(family)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-muted",
                activeFamily === family
                  ? "bg-muted text-foreground font-medium border-l-2 border-primary"
                  : "text-muted-foreground border-l-2 border-transparent",
              )}
            >
              {getFamilyIcon(family)}
              <span className="truncate">{family}</span>
            </button>
          ))}
        </div>

        {/* Right: scrollable image list */}
        <div className="flex-1 relative min-w-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                  <HardDriveIcon className="h-8 w-8 opacity-30" />
                  <span className="text-sm">No images match your search.</span>
                </div>
              ) : (
                filtered.map((image) => (
                  <button
                    key={image.name}
                    type="button"
                    onClick={() => setSelectedOS(image.name)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                      selectedOS === image.name
                        ? "bg-primary/10 border border-primary/40 hover:bg-primary/15"
                        : "border border-transparent hover:bg-muted/60",
                    )}
                  >
                    <DistroLogo distribution={image.distribution} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {image.distribution}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-xs px-1.5 py-0 h-4"
                        >
                          {image.version}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0 h-4 hidden sm:inline-flex"
                        >
                          {image.family}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                        {image.image}
                      </div>
                    </div>
                    {selectedOS === image.name && (
                      <CheckIcon className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
          {/* Bottom gradient to signal scrollability */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
        </div>
      </div>
    </div>
  );
}

export function VMImageSelect({
  selectedOS,
  setSelectedOS,
  enabled = true,
}: VMImageSelectProps) {
  const { data: images, isLoading, error } = useImages(enabled);

  if (isLoading) return <LoadingVMImageSelect />;
  if (error || !images) return <ErrorVMImageSelect error={error} />;
  if (images.length === 0) return <EmptyVMImageSelect />;

  return (
    <ImagePicker
      images={images}
      selectedOS={selectedOS}
      setSelectedOS={setSelectedOS}
    />
  );
}
