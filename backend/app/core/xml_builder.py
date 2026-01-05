from lxml import etree
from app.models.vm import VmRead
from app.core.constants import VMS_DIR


def build_xml(vm_read: VmRead):

    domain = etree.Element("domain", type="kvm")

    etree.SubElement(domain, "name").text = str(vm_read.id)
    etree.SubElement(domain, "memory", unit="MiB").text = str(vm_read.mem)
    etree.SubElement(domain, "vcpu", placement="static").text = str(
        vm_read.vcpus)

    os_el = etree.SubElement(domain, "os")
    etree.SubElement(os_el, "type", arch="x86_64", machine="pc").text = "hvm"
    etree.SubElement(os_el, "boot", dev="hd")

    features = etree.SubElement(domain, "features")
    for feature in ["acpi", "apic", "pae"]:
        etree.SubElement(features, feature)

    etree.SubElement(domain, "cpu", mode="host-passthrough")

    etree.SubElement(domain, "clock", offset="utc")

    etree.SubElement(domain, "on_poweroff").text = "destroy"
    etree.SubElement(domain, "on_reboot").text = "restart"
    etree.SubElement(domain, "on_crash").text = "destroy"

    devices = etree.SubElement(domain, "devices")

    disk_main = etree.SubElement(devices, "disk", type="file", device="disk")
    etree.SubElement(disk_main, "driver", name="qemu", type="qcow2")
    etree.SubElement(disk_main, "source", file=str(
        VMS_DIR / str(vm_read.id) / f"distribox-{vm_read.os}.qcow2"))
    etree.SubElement(disk_main, "target", dev="vda", bus="virtio")

    channel = etree.SubElement(devices, "channel", type="unix")
    etree.SubElement(channel, "source", mode="bind")
    etree.SubElement(channel, "target", type="virtio",
                     name="org.qemu.guest_agent.0")

    disk_seed = etree.SubElement(devices, "disk", type="file", device="cdrom")
    etree.SubElement(disk_seed, "driver", name="qemu", type="raw")
    etree.SubElement(disk_seed, "source", file="/var/lib/distribox/images/seed.iso")
    etree.SubElement(disk_seed, "target", dev="hdb", bus="ide")
    etree.SubElement(disk_seed, "readonly")

    iface = etree.SubElement(devices, "interface", type="network")
    etree.SubElement(iface, "source", network="default")
    etree.SubElement(iface, "model", type="virtio")

    etree.SubElement(devices, "graphics", type="vnc",
                     port="-1", autoport="yes", listen="127.0.0.1")

    etree.SubElement(devices, "console", type="pty")
    etree.SubElement(devices, "input", type="keyboard", bus="ps2")
    etree.SubElement(devices, "input", type="tablet", bus="usb")

    xml_string = etree.tostring(
        domain, pretty_print=True, encoding="utf-8").decode()
    return xml_string
