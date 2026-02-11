import { realpath } from "node:fs/promises";
import { dirname, basename } from "node:path";

export async function splitFile(path: string): Promise<[string, string]> {
  const base = await realpath(dirname(path));
  const filename = basename(path);
  return [base, filename];
}
