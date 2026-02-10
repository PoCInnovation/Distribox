import { Ora } from "ora";
import { readFiles, readMetadata } from "../io";
import chalk from "chalk";
import { s3fetchAllMetadata, s3uploadObject } from "../s3";
import { splitFile } from "../io";

export async function uploadDirectory(directoryPath: string, spinner: Ora) {
  console.log(
    chalk.cyan(`Processing directory ${chalk.yellow(directoryPath)}...`),
  );

  const pattern = /^distribox-(.*)\.qcow2$/;

  const files = await readFiles(directoryPath);

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

  const metadataFiles = await s3fetchAllMetadata();

  for (const [index, image] of images.entries()) {
    spinner.start(
      `Processing ${chalk.cyan(image)} (${chalk.yellow(index + 1)}/${chalk.yellow(images.length)})...`,
    );

    const [_, filename] = await splitFile(image);

    const configFilename = `${filename.split(".")[0]}.metadata.yaml`;
    const configPath = `${directoryPath}/${configFilename}`;

    const metadata = await readMetadata(configPath);
    const remoteMetadata = metadataFiles.find((m) => m.image === image);

    // Upload if the image metadata isn't on the registry or the revision has changed
    if (!remoteMetadata || remoteMetadata.revision !== metadata.revision) {
      spinner.start(
        `Uploading ${chalk.cyan(image)} (${chalk.yellow(index + 1)}/${chalk.yellow(images.length)})...`,
      );

      await s3uploadObject(`${directoryPath}/${image}`, image);
      await s3uploadObject(configPath, configFilename);
    } else {
      console.log(
        chalk.cyan(
          `Skipping ${chalk.cyan(image)} (${chalk.yellow(index + 1)}/${chalk.yellow(images.length)})...`,
        ),
      );
    }
  }
}
