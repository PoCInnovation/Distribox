##on host machine 

sudo virt-sysprep -a /var/lib/distribox/images/os.qcow2   --operations bash-history,logfiles,tmp-files,crash-data,utmp
sudo virt-sparsify --compress /var/lib/distribox/images/os.qcow2 /var/lib/distribox/images/distribox-ubuntu.qcow2
