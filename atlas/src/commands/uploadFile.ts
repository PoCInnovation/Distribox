import { isQcow2Image, splitFile } from "../io";
import chalk from "chalk";
import { s3uploadImage } from "../s3";
import { Ora } from "ora";

export async function uploadFile(path: string, spinner: Ora) {
  const isImage = await isQcow2Image(path);

  if (!isImage) {
    throw new Error("The file you provided is not a qcow2 image.");
  }

  const [_, filename] = await splitFile(path);

  console.log(chalk.cyan(`\`${filename}\` is a valid qcow2 image.`));

  spinner.info(`Uploading ${chalk.cyan(filename)}...`);
  await s3uploadImage(path, filename);
}
