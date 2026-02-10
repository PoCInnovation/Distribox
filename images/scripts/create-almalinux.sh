#!/bin/bash

set -e

CLOUD_IMG_URL=https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-9.7-20251118.x86_64.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

sudo cp "/tmp/$CLOUD_IMG_SOURCE" /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --update \
    --install vim,qemu-guest-agent,cloud-init \
    --run-command 'grub2-mkconfig -o /boot/grub2/grub.cfg' \
    --run-command 'grub2-install /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-almalinux-9.qcow2"

SCRIPT_DIR=/usr/local/bin
sudo cp "${SCRIPT_DIR}/distribox-almalinux-9.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-almalinux-9.qcow2"

sudo rm -f /tmp/resized_image.qcow2
