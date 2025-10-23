echo "Installing libvirt dependencies..."
sudo apt install qemu-kvm libvirt-daemon-system genisoimage libvirt-clients bridge-utils virtinst
echo "Enabling libvirt daemon (libvirtd)..."
sudo systemctl enable libvirtd
