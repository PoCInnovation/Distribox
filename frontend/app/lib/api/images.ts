import type { ImageMetadata, ImageUploadPayload } from "@/lib/types";
import { ImageMetadataSchema, ImageUploadStatusSchema } from "@/lib/types";
import { API_BASE_URL, apiRequest, getAuthToken } from "./core";

const CHUNK_SIZE = 16 * 1024 * 1024;

export async function getImages(): Promise<ImageMetadata[]> {
  return apiRequest("/images/", {}, ImageMetadataSchema.array());
}

function readErrorDetail(body: string, status: number): string {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  } catch {
    return `HTTP ${status}`;
  }
  return `HTTP ${status}`;
}

function sendChunk(
  chunk: Blob,
  params: URLSearchParams,
  onLoaded: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API_BASE_URL}/images/upload?${params}`);
    const token = getAuthToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => onLoaded(event.loaded);
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(readErrorDetail(xhr.responseText, xhr.status)));
    };
    xhr.send(chunk);
  });
}

/** Resolves with why SSH could not be set up on the image, if it could not. */
async function waitForImage(
  name: string,
  onPreparing?: () => void,
): Promise<string | null> {
  const params = new URLSearchParams({ name });
  while (true) {
    const result = await apiRequest(
      `/images/upload/status?${params}`,
      {},
      ImageUploadStatusSchema,
    );
    if (result.status === "ready") return result.detail ?? null;
    if (result.status === "failed") {
      throw new Error(result.detail ?? "Image conversion failed");
    }
    if (result.status === "preparing") onPreparing?.();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Sets up SSH on an uploaded image; resolves like `waitForImage`. */
export async function prepareImage(image: string): Promise<string | null> {
  await apiRequest(
    `/images/prepare?${new URLSearchParams({ image })}`,
    { method: "POST" },
    ImageMetadataSchema,
  );
  return waitForImage(image.replace(/\.qcow2$/, ""));
}

export async function uploadImage(
  file: File,
  payload: ImageUploadPayload,
  onProgress: (percent: number) => void,
  onPreparing: () => void,
): Promise<ImageMetadata> {
  const chunkParams = new URLSearchParams({
    filename: file.name,
    name: payload.name,
  });
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    chunkParams.set("offset", String(offset));
    await sendChunk(
      file.slice(offset, offset + CHUNK_SIZE),
      chunkParams,
      (loaded) => onProgress(Math.round(((offset + loaded) / file.size) * 100)),
    );
  }

  const params = new URLSearchParams({
    filename: file.name,
    name: payload.name,
    firmware: payload.firmware,
  });
  if (payload.distribution) params.set("distribution", payload.distribution);
  if (payload.version) params.set("version", payload.version);
  const image = await apiRequest(
    `/images/upload?${params}`,
    { method: "POST" },
    ImageMetadataSchema,
  );
  onProgress(100);
  const sshDetail = await waitForImage(payload.name, onPreparing);
  return { ...image, ssh_ready: sshDetail === null, ssh_detail: sshDetail };
}
