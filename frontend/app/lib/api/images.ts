import type { ImageMetadata, ImageUploadPayload } from "@/lib/types";
import { ImageMetadataSchema } from "@/lib/types";
import {
  API_BASE_URL,
  apiRequest,
  getAuthToken,
  validateWithSchema,
} from "./core";

export async function getImages(): Promise<ImageMetadata[]> {
  return apiRequest("/images", {}, ImageMetadataSchema.array());
}

function readErrorDetail(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `HTTP ${status}`;
}

export function uploadImage(
  file: File,
  payload: ImageUploadPayload,
  onProgress: (percent: number) => void,
): Promise<ImageMetadata> {
  const params = new URLSearchParams({
    filename: file.name,
    name: payload.name,
    firmware: payload.firmware,
  });
  if (payload.distribution) params.set("distribution", payload.distribution);
  if (payload.version) params.set("version", payload.version);
  const endpoint = `/images/upload?${params}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${endpoint}`);
    const token = getAuthToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(validateWithSchema(ImageMetadataSchema, body, endpoint));
        return;
      }
      reject(new Error(readErrorDetail(body, xhr.status)));
    };
    xhr.send(file);
  });
}
