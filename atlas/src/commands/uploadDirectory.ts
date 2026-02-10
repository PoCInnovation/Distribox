import { Ora } from "ora";
import { readFiles } from "../io";
import chalk from "chalk";
import { s3uploadImage } from "../s3";
import { splitFile } from "../io";

export async function uploadDirectory(path: string, spinner: Ora) {
  console.log(chalk.cyan(`Processing directory ${chalk.yellow(path)}...`));

  const pattern = /^distribox-(.*)\.qcow2$/;

  const files = await readFiles(path);

  const matches = await Promise.all(
    files.map(async (f) => {
      const [_, filename] = await splitFile(f);
      return {
        file: f,
        isMatch: pattern.test(filename),
      };
    }),
  );

  const images = matches.filter((m) => m.isMatch).map((m) => m.file);

  if (images.length === 0) {
    throw new Error("No distribox image found in the directory.");
  }

  for (const [index, image] of images.entries()) {
    spinner.start(
      `Uploading ${chalk.cyan(image)} (${chalk.yellow(index + 1)}/${chalk.yellow(images.length)})...`,
    );
    await s3uploadImage(`${path}/${image}`, image);
  }
}
