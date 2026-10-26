import { useImages } from "@/hooks/useImages";
import { useAuthz } from "@/contexts/authz-context";
import { Policy } from "@/lib/types";
import { resolveOsInfo, type OsInfo } from "@/lib/vm-os";
import { DistroLogo } from "@/components/distro-logo";
import { cn } from "@/lib/utils";

export function useOsInfo(image: string): OsInfo {
  const authz = useAuthz();
  const images = useImages(authz.hasPolicy(Policy.IMAGES_GET));
  return resolveOsInfo(image, images.data);
}

export function VmOsLabel({
  image,
  showImage = false,
  logoClassName,
  className,
}: {
  image: string;
  showImage?: boolean;
  logoClassName?: string;
  className?: string;
}) {
  const os = useOsInfo(image);
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <DistroLogo
        distribution={os.distribution}
        className={cn("size-7 bg-secondary", logoClassName)}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm" title={os.image}>
          {os.label}
        </span>
        {showImage && (
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {os.image}
          </span>
        )}
        {!showImage && os.isLocal && (
          <span className="block text-xs text-muted-foreground">
            Local image
          </span>
        )}
      </span>
    </span>
  );
}
