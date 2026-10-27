import { useState } from "react";
import { HardDriveIcon } from "lucide-react";
import { cn } from "~/lib/utils";

const DISTRO_ICON_SLUGS: Record<string, string> = {
  debian: "debian",
  ubuntu: "ubuntu",
  archlinux: "archlinux",
  "arch linux": "archlinux",
  fedora: "fedora",
  centos: "centos",
  "red hat enterprise linux": "redhat",
  rhel: "redhat",
  opensuse: "opensuse",
  "alpine linux": "alpinelinux",
  alpine: "alpinelinux",
  manjaro: "manjaro",
  "kali linux": "kalilinux",
  kali: "kalilinux",
  "linux mint": "linuxmint",
  almalinux: "almalinux",
  "rocky linux": "rockylinux",
  nixos: "nixos",
  freebsd: "freebsd",
  openbsd: "openbsd",
  windows: "windows",
  "windows server": "windows",
};

export type DistroLogoSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<DistroLogoSize, { box: string; glyph: string }> = {
  sm: { box: "w-7 h-7", glyph: "w-4 h-4" },
  md: { box: "w-9 h-9", glyph: "w-5 h-5" },
  lg: { box: "w-12 h-12", glyph: "w-7 h-7" },
};

interface DistroLogoProps {
  distribution: string;
  className?: string;
  /** Visual size of the tile. Defaults to "md" (36px), the historical size. */
  size?: DistroLogoSize;
}

export function DistroLogo({
  distribution,
  className,
  size = "md",
}: DistroLogoProps) {
  const [imgError, setImgError] = useState(false);
  const slug = DISTRO_ICON_SLUGS[distribution.toLowerCase()];
  const sizes = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-muted shrink-0",
        sizes.box,
        className,
      )}
    >
      {slug && !imgError ? (
        <img
          src={`https://cdn.simpleicons.org/${slug}`}
          alt={distribution}
          className={sizes.glyph}
          onError={() => setImgError(true)}
        />
      ) : (
        <HardDriveIcon className={cn(sizes.glyph, "text-muted-foreground")} />
      )}
    </div>
  );
}
