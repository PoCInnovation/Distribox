#!/bin/bash

set -e

CLOUD_IMG_URL=https://cdimage.debian.org/images/cloud/bookworm/20251112-2294/debian-12-generic-amd64-20251112-2294.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 9G
sudo virt-resize --expand /dev/sda1 \
    "/tmp/$CLOUD_IMG_SOURCE" \
    /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --update \
    --install vim,qemu-guest-agent,cloud-init \
    --run-command 'update-initramfs -u' \
    --run-command 'update-grub' \
    --run-command 'grub-install /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "${DISTRIBOX_IMG_PATH}distribox-debian-12.qcow2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo cp "${SCRIPT_DIR}/distribox-debian-12.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-debian-12.qcow2"

sudo rm -f /tmp/resized_image.qcow2
