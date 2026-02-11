import ora from "ora";
import { s3fetchAllMetadata } from "../s3";
import chalk from "chalk";

export async function list() {
  const spinner = ora("Fetching metadata from the registry...").start();

  const metadataFiles = await s3fetchAllMetadata();

  for (const metadata of metadataFiles) {
    console.log(chalk.gray("\n----------------------------------------"));
    console.log(`Name: ${chalk.cyan(metadata.name)}`);
    console.log(`Image: ${chalk.green(metadata.image)}`);
    console.log(`Version: ${chalk.cyan(metadata.version)}`);
    console.log(`Distribution: ${chalk.cyan(metadata.distribution)}`);
    console.log(`Family: ${chalk.cyan(metadata.family)}`);
    console.log(`Revision: ${chalk.yellow(metadata.revision)}`);
    console.log(chalk.gray("----------------------------------------"));
  }

  spinner.succeed(`Fetched ${metadataFiles.length} images from the registry.`);
}
