# Distribox Atlas

Atlas is the syncing tool to upload images to the Distribox registry.

## Installation

### Prerequisites

Before installing the atlas, you need to install the following dependencies:

- Node.js v22.18.0, use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions automatically.
- [pnpm](https://pnpm.io/) (v10.x or higher), you can alternatively use corepack to manage pnpm.

If you are a user that wants to use atlas to create your own registry, you can use our terraform config to setup the bucket and the permissions. [See here.](#use-terraform)

- Install [terraform](https://www.terraform.io/downloads.html).

### Installing the dependencies

To install the dependencies, run the following command:

```bash
pnpm install
```

## AWS Setup

To use the atlas, you need to configure your AWS credentials.

Please follow the instructions below to configure your AWS credentials:

```bash
aws configure --profile distribox
```

You will be prompted to enter your AWS credentials. You can create those in the AWS Management Console.

- AWS Access Key ID: Enter your IAM user access key.
- AWS Secret Access Key: Enter your IAM user secret key.
- Default region name: eu-west-3.
- Default output format: json.

Your IAM user must have the following permissions:

- s3:GetObject
- s3:PutObject
- s3:ListBucket
- s3:ListObjectsV2
- s3:DeleteObject

## Environment Variables

Copy the `.env.default` file to `.env` and configure the following environment variables:

- `AWS_PROFILE`: The AWS profile to use. `distribox` if you followed the instructions above.
- `AWS_REGION`: The AWS region to use. `eu-west-3` if you followed the instructions above.
- `DISTRIBOX_BUCKET_REGISTRY`: The name of the bucket to use for the Distribox registry. You can use the `distribox-images` bucket.

> Note: If you already have a profile setup, you might need to `unset AWS_PROFILE` before running atlas. It won't overwrite the profile if it's already set, therefore it will use the wrong credentials.

## Usage

At it's core, the atlas is a CLI tool that allows you to upload images to the Distribox registry.

You can use the scripts to upload images.

```bash
pnpm upload path # ../images/dist/distribox-ubuntu-22-04.qcow2

pnpm upload:all # ../images/dist/

pnpm images:list # List all images on the registry

pnpm images:delete distribox-ubuntu-22-04.qcow2 # Delete distribox-ubuntu-22-04 from the registry, you can also delete multiple images at once
```

Where `<path>` is the path to the directory containing the images to upload or a single image to upload.

To build images you can check the [available documentation](/images/README.md).

## Use Terraform

After installing terraform, you can use the terraform config to setup the bucket and the permissions.

```bash
terraform init

# This is optional, but you should check the terraform plan before applying it.
terraform plan

terraform apply
```

This should ensure your registry is setup correctly.

It will create a bucket called `distribox-images` and set the correct permissions.
