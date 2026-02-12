import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getBucket } from "./bucket";
import { s3 } from "./client";

export async function s3remove(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  await s3.send(command);
}
