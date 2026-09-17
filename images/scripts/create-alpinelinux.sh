#!/bin/bash

set -euo pipefail

CLOUD_IMG_URL=https://dl-cdn.alpinelinux.org/alpine/v3.21/releases/cloud/generic_alpine-3.21.5-x86_64-bios-cloudinit-r0.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

# The BIOS cloud image uses ext4 directly on the disk, without a partition table.
sudo cp "/tmp/$CLOUD_IMG_SOURCE" /tmp/resized_image.qcow2
sudo qemu-img resize /tmp/resized_image.qcow2 9G
sudo guestfish --rw -a /tmp/resized_image.qcow2 <<'EOF'
run
e2fsck-f /dev/sda
resize2fs /dev/sda
EOF

# Keep the image's virt kernel and extlinux BIOS bootloader.
sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --run-command 'apk update && apk upgrade' \
    --run-command 'apk add vim qemu-guest-agent openssh cloud-init gettext bash sudo' \
    --run-command 'rc-update add qemu-guest-agent default'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-alpinelinux-3-21.qcow2"

SCRIPT_DIR=/usr/local/bin
sudo cp "${SCRIPT_DIR}/distribox-alpinelinux-3-21.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-alpinelinux-3-21.qcow2"

sudo rm -f /tmp/resized_image.qcow2
