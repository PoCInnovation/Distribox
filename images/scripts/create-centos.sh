#!/bin/bash

set -euo pipefail

CLOUD_IMG_URL=https://cloud.centos.org/centos/10-stream/x86_64/images/CentOS-Stream-GenericCloud-x86_64-10-20260818.0.x86_64.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

sudo cp "/tmp/$CLOUD_IMG_SOURCE" /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --update \
    --install vim,qemu-guest-agent,cloud-init \
    --run-command 'grub2-mkconfig -o /boot/grub2/grub.cfg'

# Relabel with the guest's policy tools; the builder's older tools only schedule a reboot-time relabel.
sudo virt-customize -a /tmp/resized_image.qcow2 \
    --run-command 'setfiles -F -e /proc -e /sys -e /dev -e /run /etc/selinux/targeted/contexts/files/file_contexts /' \
    --run-command 'rm -f /.autorelabel'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-centos-10.qcow2"

SCRIPT_DIR=/usr/local/bin
sudo cp "${SCRIPT_DIR}/distribox-centos-10.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-centos-10.qcow2"

sudo rm -f /tmp/resized_image.qcow2
