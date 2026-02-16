import "dotenv/config";
import { Command } from "commander";
import { upload, list, deleteCmd } from "./commands";

const program = new Command();

program
  .name("atlas")
  .description(
    "Distribox Atlas is the syncing tool for distribox images to our public s3 registry.",
  )
  .version("1.0.0");

program
  .command("upload")
  .description("Upload an image to the cloud")
  .argument(
    "<path>",
    "Path to the directory containing images to upload or a single image to upload",
  )
  .action(upload);

program.command("list").description("List images on the registry").action(list);

program
  .command("delete")
  .description("Delete one or more images from the registry")
  .argument(
    "<image...>",
    "Name of the image(s) to delete. Ex: distribox-ubuntu-20-04.qcow2",
  )
  .action(deleteCmd);

program.parse();
