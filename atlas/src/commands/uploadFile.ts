import { isQcow2Image, readMetadata, splitFile } from "../io";
import chalk from "chalk";
import { s3fetchMetadata, s3uploadObject } from "../s3";
import { Ora } from "ora";

export async function uploadFile(path: string, spinner: Ora) {
  const isImage = await isQcow2Image(path);

  if (!isImage) {
    throw new Error("The file you provided is not a qcow2 image.");
  }

  const pattern = /^distribox-(.*)\.qcow2$/;

  const [base, filename] = await splitFile(path);

  console.log(chalk.cyan(`\n\`${filename}\` is a valid qcow2 image.`));

  if (!pattern.test(filename)) {
    throw new Error(
      "The file you provided does not abide by the distribox images naming convention.",
    );
  }

  spinner.start(`Processing ${chalk.cyan(filename)}...`);

  const configFilename = `${filename.split(".")[0]}.metadata.yaml`;
  const configPath = `${base}/${configFilename}`;

  const metadata = await readMetadata(configPath);
  const remoteMetadata = await s3fetchMetadata(configFilename);

  // Upload if the image metadata isn't on the registry or the revision has changed
  if (!remoteMetadata || remoteMetadata.revision !== metadata.revision) {
    spinner.start(`Uploading ${chalk.cyan(filename)}...`);
    await s3uploadObject(path, filename);
    await s3uploadObject(configPath, configFilename);
  } else {
    console.log(
      chalk.yellow(
        `\nNothing to do for ${chalk.cyan(filename)}.\nIf you want to update this image on the registry please bump the revision.`,
      ),
    );
  }
}
