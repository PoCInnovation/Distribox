set -e
sudo apt update
echo "Installing libvirt dependencies..."
sudo apt install -y qemu-kvm libvirt-daemon-system genisoimage libvirt-clients bridge-utils virtinst pkg-config libvirt-dev python3-dev libguestfs-tools
echo "Enabling libvirt daemon (libvirtd)..."
sudo systemctl enable --now libvirtd


sudo mkdir /var/lib/distribox/
sudo mkdir /var/lib/distribox/images
sudo mkdir /var/lib/distribox/vms

sudo groupadd -f distribox
sudo usermod -aG distribox,kvm "$USER"

sudo chown -R root:distribox /var/lib/distribox
sudo chown -R root:distribox /var/lib/distribox/images
sudo chown -R libvirt-qemu:kvm /var/lib/distribox/vms

sudo chmod 2775 /var/lib/distribox
sudo chmod 2775 /var/lib/distribox/images
sudo chmod 2775 /var/lib/distribox/vms
