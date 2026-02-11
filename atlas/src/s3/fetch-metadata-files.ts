import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import yaml from "js-yaml";
import { s3 } from "./client";
import { getBucket } from "./bucket";
import { Metadata, MetadataSchema } from "../schemas";

export async function s3fetchMetadata(configName: string): Promise<Metadata> {
  const { Body } = await s3.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: configName,
    }),
  );
  const content = await Body!.transformToString("utf-8");
  return MetadataSchema.parse(yaml.load(content));
}

export async function s3fetchAllMetadata(): Promise<Metadata[]> {
  const { Contents = [] } = await s3.send(
    new ListObjectsV2Command({ Bucket: getBucket() }),
  );

  const names = Contents.filter((c) => c.Key?.endsWith(".metadata.yaml"))
    .map((c) => c.Key)
    .filter((n) => n !== undefined);

  return Promise.all(names.map(s3fetchMetadata));
}
