import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { Metadata, MetadataSchema } from "../schemas";

export async function readMetadata(path: string): Promise<Metadata> {
  const content = await readFile(path, "utf-8");
  const rawConfig = yaml.load(content);

  return MetadataSchema.parse(rawConfig);
}
