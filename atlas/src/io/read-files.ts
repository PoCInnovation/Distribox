import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function readFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(dir, e.name));
}
