echo "Installing libvirt dependencies..."
sudo apt install qemu-kvm libvirt-daemon-system genisoimage libvirt-clients bridge-utils virtinst pkg-config libvirt-dev python3-dev
echo "Enabling libvirt daemon (libvirtd)..."
sudo systemctl enable libvirtd
