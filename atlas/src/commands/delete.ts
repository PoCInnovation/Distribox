import ora from "ora";
import { s3fetchAllMetadata, s3remove } from "../s3";
import chalk from "chalk";

export async function deleteCmd(images: string[]) {
  const spinner = ora("Going through images to delete...").start();

  const metadataFiles = await s3fetchAllMetadata();

  for (const [index, image] of images.entries()) {
    const metadata = metadataFiles.find((m) => m.image === image);

    if (!metadata) {
      console.log(
        chalk.yellow(
          `\nImage ${chalk.cyan(image)} not found in the registry. Skipping. ${index + 1}/${images.length}`,
        ),
      );
      continue;
    }

    const metadataFile = metadata.image.replace(".qcow2", ".metadata.yaml");

    spinner.start(
      `Deleting ${chalk.cyan(metadata.image)} (${index + 1}/${images.length})`,
    );

    await s3remove(metadata.image);

    console.log(
      `\nDeleted ${chalk.cyan(metadata.image)} (${index + 1}/${images.length})`,
    );

    spinner.start(
      `Deleting ${chalk.cyan(metadataFile)} (${index + 1}/${images.length})`,
    );

    await s3remove(metadataFile);

    console.log(
      `\nDeleted ${chalk.cyan(metadataFile)} (${index + 1}/${images.length})`,
    );
  }

  spinner.succeed("Done.");
}
