import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useImages } from "@/hooks/useImages";
import { cn } from "~/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CloudIcon } from "lucide-react";

interface VMImageSelectProps {
  selectedOS: string;
  setSelectedOS: (value: string) => void;
}

export function EmptyVMImageSelect() {
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

export function LoadingVMImageSelect() {
  return <div className="text-sm text-muted-foreground">Loading images...</div>;
}

export function ErrorVMImageSelect({ error }: { error: Error | null }) {
  return (
    <div className="text-sm text-muted-foreground">
      Error loading images: {error?.message}
    </div>
  );
}

export function VMImageSelect({
  selectedOS,
  setSelectedOS,
}: VMImageSelectProps) {
  const { data: images, isLoading: imagesLoading, error } = useImages();

  return (
    <div className="space-y-2">
      <Label htmlFor="os-template">Image</Label>
      {imagesLoading ? (
        <div className="text-sm text-muted-foreground">Loading images...</div>
      ) : (
        <Select value={selectedOS} onValueChange={setSelectedOS}>
          <SelectTrigger
            id="os-template"
            className={cn("border-2", selectedOS === "" && "")}
          >
            <CloudIcon className="h-4 w-4 text-muted-foreground" />
            <SelectValue
              className="text-primary"
              placeholder="Select an OS image"
            />
          </SelectTrigger>
          <SelectContent>
            {imagesLoading === undefined ? (
              <LoadingVMImageSelect />
            ) : error || !images ? (
              <ErrorVMImageSelect error={error} />
            ) : images.length === 0 ? (
              <EmptyVMImageSelect />
            ) : (
              images?.map((image) => (
                <SelectItem key={image.name} value={image.name}>
                  <div className="flex items-center justify-between gap-4">
                    <span>{image.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {image.virtual_size.toFixed(2)} GB
                    </span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
