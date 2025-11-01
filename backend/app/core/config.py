import libvirt

conn = libvirt.open("qemu:///system")

def get_connection():
    global conn
    if conn is None or conn.isAlive() == 0:
        try: 
            conn = libvirt.open("qemu:///system")
        except libvirt.libvirtError:
            raise
    return conn