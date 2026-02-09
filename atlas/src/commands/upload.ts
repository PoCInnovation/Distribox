import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { getPathInfo } from "../io";
import { uploadFile } from "./uploadFile";
import { uploadDirectory } from "./uploadDirectory";

export async function upload(path: string, options: any, command: Command) {
  const pathInfo = await getPathInfo(path);
  const spinner = ora("Processing your request with the minutiae of a crocodile...").start();

  if (!pathInfo.exists) {
    command.error(
      chalk.red("The path you provided does not exist or is not accessible."),
      { exitCode: 1 },
    );
  }

  if (!pathInfo.readable) {
    command.error(
      chalk.red(
        "You do not have permissions to read the path you provided or it's contents.",
      ),
      { exitCode: 1 },
    );
  }

  try {
    if (pathInfo.isFile) {
      await uploadFile(path, spinner);
    }

    if (pathInfo.isDirectory) {
      await uploadDirectory(path, spinner);
    }
  } catch (error) {
    spinner.fail(chalk.red("An error occurred while uploading your images."));
    if (error instanceof Error) {
      command.error(chalk.red(error.message), { exitCode: 1 });
    } else {
      command.error(chalk.red("Unknown error"), { exitCode: 1 });
    }
  }

  spinner.succeed(`Image${pathInfo.isDirectory ? "s" : ""} uploaded successfully.`);
}
