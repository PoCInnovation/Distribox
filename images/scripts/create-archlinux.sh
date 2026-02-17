#!/bin/bash

set -euo pipefail

CLOUD_IMG_URL=https://mirror.pkgbuild.com/images/v20251201.460866/Arch-Linux-x86_64-cloudimg.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 9G
sudo virt-resize --expand /dev/sda3 \
    "/tmp/$CLOUD_IMG_SOURCE" \
    /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --run-command 'pacman-key --init' \
    --run-command 'pacman-key --populate archlinux' \
    --run-command 'pacman -Syu --noconfirm' \
    --run-command 'pacman -S --noconfirm vim qemu-guest-agent cloud-init grub linux intel-ucode' \
    --run-command 'fuser -km /dev || true' \ # finds and kills all processes using /dev
    --run-command 'sync'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-archlinux-rolling.qcow2"

SCRIPT_DIR=/usr/local/bin
sudo cp "${SCRIPT_DIR}/distribox-archlinux-rolling.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-archlinux-rolling.qcow2"

sudo rm -f /tmp/resized_image.qcow2
