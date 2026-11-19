import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadImage } from "@/lib/api";
import type { ImageMetadata, ImageUploadPayload } from "@/lib/types";

/**
 * Image uploads run here rather than in the upload dialog, so closing the
 * dialog or changing page leaves them running in the Activity bar. They live
 * as long as the tab: a reload aborts them.
 */
export interface ImageUpload {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  distribution: string;
  status: "running" | "succeeded" | "failed";
  phase: "uploading" | "converting" | "preparing";
  bytesSent: number;
  error: string | null;
  image: ImageMetadata | null;
  startedAt: number;
  phaseStartedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  /** The dialog that started it still shows it, and reports its outcome. */
  attached: boolean;
}

let uploads: ImageUpload[] = [];
let nextId = 0;
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function set(next: ImageUpload[]) {
  uploads = next;
  for (const listener of listeners) listener();
}

function update(id: string, patch: Partial<ImageUpload>) {
  set(uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)));
}

function find(id: string): ImageUpload | undefined {
  return uploads.find((u) => u.id === id);
}

function setPhase(id: string, phase: ImageUpload["phase"]) {
  if (find(id)?.phase === phase) return;
  const at = Date.now();
  update(id, { phase, phaseStartedAt: at, updatedAt: at });
}

export function subscribeImageUploads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getImageUploads(): ImageUpload[] {
  return uploads;
}

export function startImageUpload(
  file: File,
  payload: ImageUploadPayload,
  queryClient: QueryClient,
): string {
  const id = `upload-${++nextId}`;
  const controller = new AbortController();
  controllers.set(id, controller);
  const now = Date.now();
  set([
    {
      id,
      name: payload.name,
      fileName: file.name,
      fileSize: file.size,
      distribution: payload.distribution,
      status: "running",
      phase: "uploading",
      bytesSent: 0,
      error: null,
      image: null,
      startedAt: now,
      phaseStartedAt: now,
      updatedAt: now,
      finishedAt: null,
      attached: true,
    },
    ...uploads,
  ]);

  uploadImage(
    file,
    payload,
    {
      onProgress: (bytesSent) =>
        update(id, { bytesSent, updatedAt: Date.now() }),
      onConverting: () => setPhase(id, "converting"),
      // Reported on every status poll while SSH is being set up.
      onPreparing: () => setPhase(id, "preparing"),
    },
    controller.signal,
  )
    .then((image) => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      if (!find(id)) return;
      const at = Date.now();
      update(id, { status: "succeeded", image, updatedAt: at, finishedAt: at });
      if (image.ssh_detail) {
        toast.warning(
          `Image "${image.name}" is ready, without SSH. ${image.ssh_detail}.`,
        );
      } else {
        toast.success(`Image "${image.name}" is ready`);
      }
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "The upload failed.";
      // Cancelled: the entry is already gone, and so is the partial file
      // unless deleting it failed.
      if (controller.signal.aborted) {
        if (error !== controller.signal.reason) {
          toast.error(`Couldn't delete the partial upload of ${payload.name}`, {
            description: message,
          });
        }
        return;
      }
      const upload = find(id);
      if (!upload) return;
      const at = Date.now();
      update(id, {
        status: "failed",
        error: message,
        updatedAt: at,
        finishedAt: at,
      });
      if (!upload.attached) {
        toast.error(`Couldn't upload ${upload.name}`, {
          description: message,
        });
      }
    })
    .finally(() => controllers.delete(id));

  return id;
}

/** Stops an upload and deletes what reached the server. */
export function cancelImageUpload(id: string) {
  const upload = find(id);
  if (upload?.status !== "running" || upload.phase !== "uploading") return;
  controllers.get(id)?.abort();
  set(uploads.filter((u) => u.id !== id));
}

/** The dialog closed: the upload carries on in the Activity bar. */
export function detachImageUpload(id: string) {
  update(id, { attached: false });
}

/** Removes finished uploads from the list. */
export function dismissImageUploads(ids: string[]) {
  set(uploads.filter((u) => u.status === "running" || !ids.includes(u.id)));
}
