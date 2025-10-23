CLOUD_IMG_URL=https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64-disk-kvm.img
CLOUD_IMG_FILE="${CLOUD_IMG_URL##*/}"

# download cloud image
wget -nc -P /var/lib/libvirt/images $CLOUD_IMG_URL

#generate configuration iso for cloud image, see what's in seed-config/
genisoimage -output /var/lib/libvirt/images/seed.iso -volid cidata -joliet -rock seed-config/

#defines and starts vm using vm.xml
sudo virsh define vm.xml
sudo virsh start ubuntu-cloud-vm
