VM_NAME=ubuntu-cloud-vm
CLOUD_IMG_URL=https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
CLOUD_IMG_QCOW="os.qcow2"
LIBVIRT_IMG_PATH="/tmp/"
DISTRIBOX_IMG_PATH=/var/lib/distribox/images/

virsh destroy $VM_NAME
virsh undefine $VM_NAME --remove-all-storage
rm -f "${DISTRIBOX_IMG_PATH}${CLOUD_IMG_QCOW}"
# rm -f "${DISTRIBOX_IMG_PATH}seed.iso"

# download cloud image
wget -nc -P $LIBVIRT_IMG_PATH $CLOUD_IMG_URL

cp "${LIBVIRT_IMG_PATH}${CLOUD_IMG_URL##*/}" "${DISTRIBOX_IMG_PATH}${CLOUD_IMG_QCOW}"

# qemu-img resize "${DISTRIBOX_IMG_PATH}${CLOUD_IMG_QCOW}" +9G


#generate configuration iso for cloud image, see what's in seed-config/
# genisoimage -output "${DISTRIBOX_IMG_PATH}seed.iso" -volid cidata -joliet -rock seed-config/
# genisoimage -output "/var/lib/distribox/images/seed.iso" -volid cidata -joliet -rock seed-config/

# #defines and starts vm using vm.xml
# virsh define vm.xml
# virsh start $VM_NAME

##run clear_vm.sh after the vm creation. It will shutdown when init is finished