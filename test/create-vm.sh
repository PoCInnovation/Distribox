VM_NAME=ubuntu-cloud-vm
CLOUD_IMG_URL=https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
CLOUD_IMG_FILE="${CLOUD_IMG_URL##*/}"
CLOUD_IMG_QCOW="${CLOUD_IMG_FILE%.*}.qcow2"
IMG_PATH=/var/lib/libvirt/images/

virsh destroy $VM_NAME
virsh undefine $VM_NAME --remove-all-storage
rm -f "${IMG_PATH}${CLOUD_IMG_QCOW}"

ls /var/lib/libvirt/images
# download cloud image
wget -nc -P $IMG_PATH $CLOUD_IMG_URL

qemu-img convert -f raw -O qcow2 "${IMG_PATH}${CLOUD_IMG_FILE}" "${IMG_PATH}${CLOUD_IMG_QCOW}"

chown libvirt-qemu:kvm /var/lib/libvirt/images/jammy-server-cloudimg-amd64.qcow2
chmod 0640 /var/lib/libvirt/images/jammy-server-cloudimg-amd64.qcow2


#generate configuration iso for cloud image, see what's in seed-config/
genisoimage -output /var/lib/libvirt/images/seed.iso -volid cidata -joliet -rock seed-config/

#defines and starts vm using vm.xml
virsh define vm.xml
virsh start $VM_NAME
