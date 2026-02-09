import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { s3 } from "./client";
import { getBucket } from "./bucket";
import chalk from "chalk";

export async function s3uploadImage(path: string, imageName: string) {
  const { size } = await stat(path);
  const bucket = getBucket();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: imageName,
      Body: createReadStream(path),
      ContentLength: size,
      ContentType: "application/octet-stream",
    }),
  );

  console.log(
    `Image ${chalk.green(imageName)} uploaded to ${chalk.yellow(bucket)}`,
  );
}
