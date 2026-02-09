export function getBucket() {
  const bucket = process.env.DISTRIBOX_BUCKET_REGISTRY;

  if (!bucket) {
    throw new Error(
      "The bucket name is not defined in the environment variables. Please read the README.",
    );
  }

  return bucket;
}
