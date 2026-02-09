import { createReadStream } from "node:fs";
import { s3 } from "./client";
import { getBucket } from "./bucket";
import chalk from "chalk";
import { Upload } from "@aws-sdk/lib-storage";

export async function s3uploadImage(path: string, imageName: string) {
  const bucket = getBucket();

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: imageName,
      Body: createReadStream(path),
      ContentType: "application/octet-stream",
    },
  });

  await upload.done();

  console.log(
    `Image ${chalk.green(imageName)} uploaded to ${chalk.yellow(bucket)}`,
  );
}
