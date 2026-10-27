import { useEffect, useRef, useState } from "react";

/**
 * The backend refuses a disk smaller than the image itself with
 * "Disk size must be at least N GB". The image size is only known once the
 * host has the image, so the forms learn it from that error.
 */
export function minDiskFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = /Disk size must be at least (\d+) GB/.exec(error.message);
  return match ? Number(match[1]) : null;
}

/** Smallest disk the host accepts for `image`, once an error has told us. */
export function useImageMinDisk(error: unknown, image: string) {
  const [known, setKnown] = useState<Record<string, number>>({});
  // The image that was submitted, not whatever is picked after the error.
  const submittedImage = useRef(image);
  useEffect(() => {
    if (!error) submittedImage.current = image;
  }, [error, image]);
  useEffect(() => {
    const min = minDiskFromError(error);
    const key = submittedImage.current;
    if (min !== null && key) {
      setKnown((k) => (k[key] === min ? k : { ...k, [key]: min }));
    }
  }, [error]);
  return known[image] ?? null;
}

export function minDiskMessage(min: number) {
  return `This image needs a disk of at least ${min} GB per VM.`;
}
