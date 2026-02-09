import { Command } from "commander";
import { upload } from "./commands";

const program = new Command();

program
  .name("atlas")
  .description("Distribox Atlas is the syncing tool for distribox images to our public s3 registry.")
  .version("1.0.0");

program
  .command("upload")
  .description("Upload an image to the cloud")
  .argument("<path>", "Path to the directory containing images to upload or a single image to upload")
  .action(upload);

program.parse();
