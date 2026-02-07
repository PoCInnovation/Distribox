import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImages } from "@/hooks/useImages";
import { cn } from "~/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CloudIcon, FrownIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import type { Image as ImageType } from "~/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area"
import { Image } from "@unpic/react";

interface VMImageSelectProps {
  selectedOS: string;
  setSelectedOS: (value: string) => void;
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
          The public registry is empty, or you haven't uplaoded any images on
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
          please check that your bucket is accessible from the host machine
          contains valid qcow2 images.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ImageSelectOptions({ images }: { images: ImageType[] }) {
  return (
    <ScrollArea className="rounded-lg border-dashed text-center text-balance h-80 p-2">
      <div className="space-y-2">
        {images?.map((image) => (
          <SelectItem key={image.name} value={image.name} className="focus:bg-primary/25 focus:text-inherit h-fit border border-primary bg-primary/10 cursor-pointer">
            <Image className="transform translate-x-3" src="https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/debian-logo-icon.png" width={45} height={45} alt="" />
            <div className="grid grid-cols-1 text-left py-5 px-6">
              <div className="space-x-3">
                <span className="text-l font-mono">Debian 12</span>
                <span className="text-xs text-muted-foreground">
                  {image.virtual_size.toFixed(2)} GB
                </span>
              </div>
              <div>
                <span className="font-mono">{image.name}</span>
              </div>
            </div>
          </SelectItem>
        ))}
        <SelectItem key={"ubuntu"} value={"ubuntu"} className="focus:bg-primary/25 focus:text-inherit h-fit border border-primary bg-primary/10 cursor-pointer">
          <Image className="transform translate-x-3" src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/UbuntuCoF.svg/960px-UbuntuCoF.svg.png" width={45} height={45} alt="" />
          <div className="flex flex-col items-start justify-between gap-1 py-5 px-6">
            <div className="space-x-3">
              <span className="text-l font-mono">Ubuntu 25.10</span>
              <span className="text-xs text-muted-foreground">
                {"11.00"} GB
              </span>
            </div>
            <div>
              <span className="font-mono">{"distribox-ubuntu.qcow2"}</span>
            </div>
          </div>
        </SelectItem>
      </div>
    </ScrollArea>
  );
}

export function VMImageSelect({
  selectedOS,
  setSelectedOS,
}: VMImageSelectProps) {
  const { data: images, isLoading: imagesLoading, error } = useImages();

  return (
    <div className="space-y-2 w-full">
      <div className="flex justify-center">
        <Select value={selectedOS} onValueChange={setSelectedOS}>
          <SelectTrigger
            id="os-template"
            className={cn("border-2", selectedOS === "" && "")}
          >
            <CloudIcon className="h-4 w-4 text-muted-foreground" />
            <SelectValue
              className="text-primary"
              placeholder="Select an OS image"
            >
              {selectedOS || "Select an OS image"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {imagesLoading === undefined ? (
              <LoadingVMImageSelect />
            ) : error || !images ? (
              <ErrorVMImageSelect error={error} />
            ) : images.length === 0 ? (
              <EmptyVMImageSelect />
            ) : (
              <ImageSelectOptions images={images} />
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
