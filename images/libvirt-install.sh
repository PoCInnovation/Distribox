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
    sudo pacman -Sy libvirt qemu-desktop virt-manager virt-viewer
    set +x
}

ubuntu() {
    orange "\nUbuntu detected"
    init
    set -x
    sudo apt update
    sudo apt install -y qemu-kvm libvirt-daemon-system genisoimage libvirt-clients bridge-utils virtinst pkg-config libvirt-dev python3-dev libguestfs-tools
    set +x
}

macos() {
    blue "\nmacOS detected"
    init
    set -x
    brew install qemu libvirt
    set +x
}

if [[ "$(uname)" == "Darwin" ]]; then
    macos
elif [ -f "/etc/pacman.conf" ]; then
    arch
elif dpkg -l 2>/dev/null | grep -q git; then
    ubuntu
fi

if [[ "$(uname)" == "Darwin" ]]; then
    echo "Enabling libvirt daemon (libvirtd)..."
    brew services start libvirt
else
    echo "Enabling libvirt daemon (libvirtd)..."
    sudo systemctl enable --now libvirtd
fi

sudo mkdir -p /var/lib/distribox/images
sudo mkdir -p /var/lib/distribox/vms

echo "Creating distribox user group"

if [[ "$(uname)" == "Darwin" ]]; then
    sudo dseditgroup -o create distribox 2>/dev/null || true
    sudo dseditgroup -o edit -a $(whoami) -t user distribox
    echo "Please restart your terminal session to apply group changes."
else
    echo "Please run \`newgrp distribox\` to apply changes temporarily or restart your user session."
    sudo groupadd -f distribox
    sudo usermod -aG distribox,kvm $(whoami)
    newgrp distribox
fi

sudo chown -R root:distribox /var/lib/distribox
sudo chown -R root:distribox /var/lib/distribox/images

if [[ "$(uname)" != "Darwin" ]]; then
    sudo chown -R libvirt-qemu:kvm /var/lib/distribox/vms
fi

sudo chmod 2775 /var/lib/distribox
sudo chmod 2775 /var/lib/distribox/images
sudo chmod 2775 /var/lib/distribox/vms
