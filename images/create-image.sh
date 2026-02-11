#!/bin/bash

set -e

OUTPUT_DIR="$(pwd)/dist"
IMAGE_NAME="distribox-image-builder"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <image-script> [image-script...]"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

for IMAGE in "$@"; do
    echo "=== Building image: $IMAGE ==="

    docker build --build-arg "IMAGE=$IMAGE" -t "$IMAGE_NAME" .

    docker run --rm --privileged \
        -v "$OUTPUT_DIR:/var/lib/distribox/images" \
        "$IMAGE_NAME"

    docker run --rm \
        -v "$OUTPUT_DIR:/data" \
        alpine \
        chown -R "$(id -u):$(id -g)" /data

    echo "=== Done: $IMAGE ==="
done

echo "Distribox images are in $OUTPUT_DIR"
