import type { ImageMetadata } from "@/lib/types";

export interface OsInfo {
  /** Human label, e.g. "Ubuntu 24.04" or "GLO-2000 Course VM". */
  label: string;
  /** Distribution name used for the logo lookup, e.g. "Ubuntu". */
  distribution: string;
  version: string;
  /** True for user-uploaded `local-*` images. */
  isLocal: boolean;
  /** The raw image filename. */
  image: string;
}

const DISTRO_NAMES: Record<string, string> = {
  ubuntu: "Ubuntu",
  debian: "Debian",
  fedora: "Fedora",
  centos: "CentOS",
  archlinux: "Arch Linux",
  arch: "Arch Linux",
  "alpine-linux": "Alpine Linux",
  alpine: "Alpine Linux",
  "kali-linux": "Kali Linux",
  kali: "Kali Linux",
  almalinux: "AlmaLinux",
  rockylinux: "Rocky Linux",
  rocky: "Rocky Linux",
  opensuse: "openSUSE",
  manjaro: "Manjaro",
  "linux-mint": "Linux Mint",
  mint: "Linux Mint",
  rhel: "Red Hat Enterprise Linux",
  freebsd: "FreeBSD",
  openbsd: "OpenBSD",
  windows: "Windows",
  "windows-server": "Windows Server",
  nixos: "NixOS",
  gentoo: "Gentoo",
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Parse an image filename into something readable.
 *
 *   distribox-ubuntu-24.04.qcow2       -> Ubuntu 24.04
 *   distribox-alpine-linux-3.21.qcow2  -> Alpine Linux 3.21
 *   local-glo2000-course.qcow2         -> glo2000-course (local image)
 */
export function parseOsImage(image: string): OsInfo {
  const base = image.replace(/\.(qcow2|img|raw|iso|vmdk)$/i, "");
  const isLocal = base.startsWith("local-");
  const body = base.replace(/^(distribox|local)-/, "");

  if (isLocal) {
    return {
      label: body || base,
      distribution: "",
      version: "",
      isLocal,
      image,
    };
  }

  const parts = body.split("-");
  const versionIndex = parts.findIndex((p) => /^\d/.test(p));
  const distroParts =
    versionIndex === -1 ? parts : parts.slice(0, versionIndex);
  const versionParts = versionIndex === -1 ? [] : parts.slice(versionIndex);
  const distroSlug = distroParts.join("-");
  const distribution = DISTRO_NAMES[distroSlug] ?? titleCase(distroSlug);
  const version = versionParts.join("-");

  return {
    label: version ? `${distribution} ${version}` : distribution,
    distribution,
    version,
    isLocal,
    image,
  };
}

/**
 * Resolve OS info for a VM, preferring registry metadata when the image is
 * known (gives uploaded images their real name and distribution).
 */
export function resolveOsInfo(
  image: string,
  images: ImageMetadata[] | undefined,
): OsInfo {
  const parsed = parseOsImage(image);
  const meta = images?.find((i) => i.image === image);
  if (!meta) return parsed;
  return {
    ...parsed,
    label: meta.name || parsed.label,
    distribution: meta.distribution || parsed.distribution,
    version: meta.version || parsed.version,
  };
}
