#!/bin/bash
CLOUD_IMG_URL=https://fastly.mirror.pkgbuild.com/images/v20250901.414475/Arch-Linux-x86_64-cloudimg.qcow2
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

set -e 
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
    # --run-command 'mkinitcpio -P' \
    # --run-command 'grub-mkconfig -o /boot/grub/grub.cfg' \
    # --run-command 'grub-install --target=i386-pc /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "/var/lib/distribox/images/distribox-archlinux.qcow2"

sudo rm -f /tmp/resized_image.qcow2