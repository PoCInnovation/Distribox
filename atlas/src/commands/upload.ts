import chalk from "chalk";
import ora from "ora";
import { getPathInfo } from "../io";
import { uploadFile } from "./uploadFile";
import { uploadDirectory } from "./uploadDirectory";

export async function upload(path: string) {
  const pathInfo = await getPathInfo(path);
  const spinner = ora(
    "Processing your request with the minutiae of a crocodile...",
  ).start();

  if (!pathInfo.exists) {
    spinner.fail(
      chalk.red("The path you provided does not exist or is not accessible."),
    );
    process.exit(1);
  }

  if (!pathInfo.readable) {
    spinner.fail(
      chalk.red(
        "You do not have permissions to read the path you provided or it's contents.",
      ),
    );
    process.exit(1);
  }

  try {
    if (pathInfo.isFile) {
      await uploadFile(path, spinner);
    }

    if (pathInfo.isDirectory) {
      await uploadDirectory(path, spinner);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.log(chalk.yellow(error.message));
      spinner.fail(chalk.red("An error occurred while uploading your images."));
      process.exit(1);
    } else {
      spinner.fail(
        chalk.red("An unknown error occurred while uploading your images."),
      );
      process.exit(1);
    }
  }

  spinner.succeed(
    `Image${pathInfo.isDirectory ? "s" : ""} uploaded successfully.`,
  );
}
