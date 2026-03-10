import { useState } from "react";
import { HardDriveIcon } from "lucide-react";
import { cn } from "~/lib/utils";

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

interface DistroLogoProps {
  distribution: string;
  className?: string;
}

export function DistroLogo({ distribution, className }: DistroLogoProps) {
  const [imgError, setImgError] = useState(false);
  const slug = DISTRO_ICON_SLUGS[distribution.toLowerCase()];

  return (
    <div
      className={cn(
        "w-9 h-9 flex items-center justify-center rounded-md bg-muted shrink-0",
        className,
      )}
    >
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
