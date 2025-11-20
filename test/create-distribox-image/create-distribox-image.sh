#!/bin/bash

if [[ $# -ne 2 ]]; then
    echo "ERROR: need first argument: image url, second argument image name"
    exit 1
fi

CLOUD_IMG_URL=$1
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -nc -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

set -e 
sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 9G
sudo virt-resize --expand /dev/sda1 \
    "/tmp/$CLOUD_IMG_SOURCE" \
    /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --update \
    --install vim,qemu-guest-agent,cloud-init,linux-virtual-hwe-22.04 \
    --run-command 'update-initramfs -u' \
    --run-command 'update-grub' \
    --run-command 'grub-install /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-$2.qcow2"

sudo rm -f /tmp/resized_image.qcow2