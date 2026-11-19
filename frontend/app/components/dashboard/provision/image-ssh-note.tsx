import { LoaderCircleIcon } from "lucide-react";
import { useAuthz } from "@/contexts/authz-context";
import { usePrepareImage } from "@/hooks/useImages";
import { Policy, type ImageMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Says when an uploaded image lacks what SSH needs, and offers to add it. */
export function ImageSshNote({ image }: { image: ImageMetadata }) {
  const authz = useAuthz();
  const prepare = usePrepareImage();

  if (image.family !== "local" || image.ssh_ready) return null;
  if (prepare.isPending) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" />
        Setting up SSH on this image
      </p>
    );
  }

  const failure = prepare.isError
    ? prepare.error.message
    : image.ssh_ready === false
      ? image.ssh_detail
      : null;
  return (
    <p
      className={cn(
        "text-xs leading-relaxed",
        failure ? "text-amber-300" : "text-muted-foreground",
      )}
    >
      {failure
        ? `SSH is not set up on this image. ${failure}.`
        : "SSH is not set up on this image."}
      {authz.hasPolicy(Policy.IMAGES_UPLOAD) && (
        <>
          {" "}
          <button
            type="button"
            onClick={() => prepare.mutate(image.image)}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {failure ? "Try again" : "Set it up"}
          </button>
        </>
      )}
    </p>
  );
}
