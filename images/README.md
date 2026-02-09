# Distribox Images Guide

First of all, you need to install the `libvirt` package on your host system.

Please use the following script to install the dependencies:

```bash
cd images

chmod +x libvirt-install.sh
./libvirt-install.sh
```

> Note: This script is only works on debian-based systems. Other distributions are

## Create an image

```bash
cd images

chmod +x create-image.sh
./create-image.sh create-ubuntu
```

The script will run a docker container with the specified image builder and output it to the dist folder.

This is what the script does:
```bash
docker build --build-arg "IMAGE=scripts/$IMAGE" -t qcow2-builder .

mkdir -p dist
docker run --rm \
    --privileged \
    -v $(pwd)/dist:/var/lib/distribox/images \ # This maps the output of the builder to the `dist` folder through a shared volume
    qcow2-builder
```
