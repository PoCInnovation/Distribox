import { Ora } from "ora";
import { readFiles } from "../io";
import chalk from "chalk";
import { s3uploadImage } from "../s3";

export async function uploadDirectory(path: string, spinner: Ora) {
  console.log(chalk.cyan(`Processing directory ${chalk.yellow(path)}...`));

  const pattern = /^distribox-(.*)\.qcow2$/;
  const images = await readFiles(path).then((files) =>
    files.filter((f) => pattern.test(f)),
  );

  if (images.length === 0) {
    throw new Error("No distribox image found in the directory.");
  }

  for (const [index, image] of images.entries()) {
    spinner.info(
      `Uploading ${chalk.cyan(image)} (${chalk.yellow(index + 1)}/${chalk.yellow(images.length)})...`,
    );
    await s3uploadImage(`${path}/${image}`, image);
  }
}
