#!/bin/bash
##on host machine
#execute using sudo

set -e 
sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 10G

sudo virt-resize --expand /dev/sda1 \
    /var/lib/distribox/images/os.qcow2 \
    /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --update \
    --install vim,qemu-guest-agent,cloud-init,linux-virtual-hwe-22.04,xubuntu-desktop \
    --run-command 'update-initramfs -u' \
    --run-command 'update-grub' \
    --run-command 'grub-install /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 /var/lib/distribox/images/distribox-ubuntu.qcow2
rm -f /tmp/resized_image.qcow2