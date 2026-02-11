# Distribox Atlas

Atlas is the syncing tool to upload images to the Distribox registry.

## Installation

### Prerequisites

Before installing the atlas, you need to install the following dependencies:

- Node.js v22.18.0, use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions automatically.
- [pnpm](https://pnpm.io/) (v10.x or higher), you can alternatively use corepack to manage pnpm.

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

## Usage

At it's core, the atlas is a CLI tool that allows you to upload images to the Distribox registry.

You can use the scripts to upload images.

```bash
pnpm upload path # ../images/dist/distribox-ubuntu-22-04.qcow2

pnpm upload:all # ../images/dist/
```

Where `<path>` is the path to the directory containing the images to upload or a single image to upload.

To build images you can check the [available documentation](/images/README.md).
