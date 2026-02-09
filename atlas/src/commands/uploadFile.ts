import { isQcow2Image } from "../io";
import chalk from "chalk";

export async function uploadFile(path: string) {
  const isImage = await isQcow2Image(path);

  if (!isImage) {
    throw new Error("The file you provided is not a qcow2 image.");
  }

  console.log(chalk.cyan("The file you provided is a valid qcow2 image."));
}
