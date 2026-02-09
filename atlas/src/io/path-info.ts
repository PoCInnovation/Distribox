import { stat, access, readdir } from "node:fs/promises";
import { constants } from "node:fs";

interface PathInfo {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  readable: boolean;
}

export async function getPathInfo(path: string): Promise<PathInfo> {
  const result: PathInfo = {
    exists: false,
    isFile: false,
    isDirectory: false,
    readable: false,
  };

  try {
    const stats = await stat(path);
    result.exists = true;
    result.isFile = stats.isFile();
    result.isDirectory = stats.isDirectory();
  } catch {
    return result;
  }

  try {
    await access(path, constants.R_OK);
    result.readable = true;
  } catch {
    result.readable = false;
  }

  if (result.isDirectory) {
    try {
      await readdir(path);
      result.readable = false;
    } catch {
      result.readable = false;
    }
  }

  return result;
}
