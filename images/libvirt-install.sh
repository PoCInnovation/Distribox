#!/bin/bash

ITAL="\e[3m"
BOLD="\e[1m"

GREEN="\e[32m"
YELLOW="\e[33m"
RED="\e[31m"
BLUE="\033[34m"
ORANGE="\033[38;5;208m"
NONE="\e[0m"

init() {
    set -e
}

blue() {
    echo -e "$BLUE$1$NONE"
}

orange() {
    echo -e "$ORANGE$1$NONE"
}

blue "Installing libvirt dependencies..."

arch() {
    blue "\nArch system detected"
    init
    set -x
    sudo pacman -Sy libvirt qemu-desktop virt-manager virt-viewer guacamole-server
    set +x
}

ubuntu() {
    orange "\nUbuntu detected"
    init
    set -x
    sudo apt update
    sudo apt install -y qemu-kvm libvirt-daemon-system genisoimage libvirt-clients bridge-utils virtinst pkg-config libvirt-dev python3-dev libguestfs-tools libguac-client-vnc0 guacd
    set +x
}

if [ -f "/etc/pacman.conf" ]; then
    arch
else if dpkg -l | grep -q git; then
    ubuntu
fi
fi

echo "Enabling libvirt daemon (libvirtd)..."

sudo systemctl enable --now libvirtd

echo "Enabling Guacamole proxy daemon (guacd)..."
sudo systemctl enable --now guacd

sudo mkdir /var/lib/distribox/
sudo mkdir /var/lib/distribox/images
sudo mkdir /var/lib/distribox/vms

echo "Creating distribox user group"
echo "Please run \`newgrp distribox\` to apply changes temporarily or restart your user session."

sudo groupadd -f distribox
sudo usermod -aG distribox,kvm $(whoami)

newgrp distribox

sudo chown -R root:distribox /var/lib/distribox
sudo chown -R root:distribox /var/lib/distribox/images
sudo chown -R libvirt-qemu:kvm /var/lib/distribox/vms

sudo chmod 2775 /var/lib/distribox
sudo chmod 2775 /var/lib/distribox/images
sudo chmod 2775 /var/lib/distribox/vms
