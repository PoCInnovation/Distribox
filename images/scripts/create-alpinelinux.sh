#!/bin/bash

set -e

CLOUD_IMG_URL=https://dl-cdn.alpinelinux.org/alpine/v3.21/releases/cloud/generic_alpine-3.21.5-x86_64-uefi-cloudinit-r0.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 9G
sudo virt-resize --expand /dev/sda2 \
    "/tmp/$CLOUD_IMG_SOURCE" \
    /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --run-command 'apk update' \
    --run-command 'apk add vim qemu-guest-agent cloud-init gettext' \
    \
    --run-command 'apk add linux-lts linux-headers' \
    --run-command 'mkinitfs' \
    --run-command 'grub-mkconfig -o /boot/grub/grub.cfg' \
    --run-command 'grub-install /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-alpinelinux-3.21.qcow2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo cp "${SCRIPT_DIR}/distribox-alpinelinux-3.21.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-alpinelinux-3.21.qcow2"

sudo rm -f /tmp/resized_image.qcow2
