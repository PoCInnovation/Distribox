#!/bin/bash

CLOUD_IMG_URL=https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

set -e 
sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 5G
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

# 3. Nettoyage
sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

# 4. Réduction de la partition (sda3: 10G -> 4.5G)
# Crée un nouveau fichier intermédiaire pour la réduction

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    /var/lib/distribox/images/distribox-ubuntu.qcow2

# 5. Réduction de la taille virtuelle (4.5G -> 5G)
# Réduit la taille maximale du disque (VirtIO)
# sudo qemu-img resize /tmp/shrunk_partition.qcow2 5G

# 6. Finalisation (Sparsification et Compression)
# Crée le template final optimisé

# 7. Nettoyage des fichiers temporaires
sudo rm -f /tmp/resized_image.qcow2