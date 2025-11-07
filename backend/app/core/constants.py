from pathlib import Path
import libvirt

BASE_DIR = Path('/var/lib/distribox/')
VMS_DIR = BASE_DIR / 'vms'
IMAGES_DIR = BASE_DIR / 'images'

VM_STATE_NAMES = {
    libvirt.VIR_DOMAIN_NOSTATE: "No state",
    libvirt.VIR_DOMAIN_RUNNING: "Running",
    libvirt.VIR_DOMAIN_BLOCKED: "Bloqué sur E/S",
    libvirt.VIR_DOMAIN_PAUSED: "Paused",
    libvirt.VIR_DOMAIN_SHUTDOWN: "Stopping",
    libvirt.VIR_DOMAIN_SHUTOFF: "Stopped",
    libvirt.VIR_DOMAIN_CRASHED: "Crashed",
    libvirt.VIR_DOMAIN_PMSUSPENDED: "Suspended (power management)",
}