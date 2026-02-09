import chalk from "chalk";

export function upload(path: string) {
  console.log(chalk.green("Uploading images to the cloud"), chalk.yellow(path));
}
