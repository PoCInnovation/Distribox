#!/bin/bash

set -e

IMAGE=$1
OUTPUT_DIR="$(pwd)/dist"
IMAGE_NAME="distribox-image-builder"

if [ -z "$IMAGE" ]; then
    echo "Usage: $0 <image-script>"
    exit 1
fi

docker build --build-arg "IMAGE=$IMAGE" -t $IMAGE_NAME .

docker run --rm --privileged \
    -v "$OUTPUT_DIR:/var/lib/distribox/images" \
    $IMAGE_NAME

docker run --rm \
    -v "$OUTPUT_DIR:/data" \
    alpine \
    chown -R $(id -u):$(id -g) /data

chmod 775 $IMAGE

echo "Distribox image is in $IMAGE"
