"""Give a Linux disk image what SSH needs: a guest agent and an SSH server.

Disks exported from other hypervisors rarely have them. They are installed
offline with the image's own package manager, through libguestfs, in an
overlay that is saved only when everything worked.
"""
import json
import logging
import os
import shutil
import signal
import stat
import subprocess
from pathlib import Path

from app.services.ssh_guest import GUEST_ACCOUNT

logger = logging.getLogger(__name__)

TIMEOUT = 30 * 60
NO_ACCOUNT = "no-account"

# Runs as root inside the image. A failure exits non-zero with the reason on
# the first line of stderr; nothing is kept from a failed run.
GUEST_PREPARE = r'''
set -u
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C DEBIAN_FRONTEND=noninteractive
log=$(mktemp)
have() { command -v "$1" >/dev/null 2>&1; }
fail() {
    cause=$(grep -E '^(E|[Ee]rror|ERROR):' "$log" | tail -n 1)
    echo "$1${cause:+: $cause}" >&2
    tail -n 30 "$log" >&2
    rm -f "$log"
    exit 1
}

if have systemctl; then init=systemd
elif have rc-update && have rc-service; then init=openrc
else fail "It uses neither systemd nor OpenRC"
fi

sshd_package=openssh-server
if have apt-get && [ -e /var/lib/dpkg/status ]; then manager=apt-get
elif have zypper; then manager=zypper sshd_package=openssh
elif have dnf; then manager=dnf
elif have yum; then manager=yum
elif have pacman; then manager=pacman sshd_package=openssh
elif have apk; then manager=apk sshd_package=openssh
else manager=
fi

packages=
have qemu-ga || packages=" qemu-guest-agent"
have sshd && had_sshd=1 || { had_sshd=; packages="$packages $sshd_package"; }

install() {
    # $packages is a list of names.
    # shellcheck disable=SC2086
    case "$manager" in
        apt-get)
            apt-get -q update
            apt-get -q -y --no-install-recommends \
                -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
                install $packages ;;
        zypper) zypper --non-interactive install --no-recommends $packages ;;
        dnf) dnf -y --setopt=install_weak_deps=False install $packages ;;
        yum) yum -y install $packages ;;
        pacman)
            # Never refresh the package lists: Arch does not support partial
            # upgrades. The archive still has the versions an old list names.
            pacman -S --noconfirm --needed $packages && return
            archive=$(mktemp)
            sed 's|^[[:space:]]*Include[[:space:]]*=[[:space:]]*/etc/pacman.d/mirrorlist[[:space:]]*$|Server = https://archive.archlinux.org/packages/.all|' \
                /etc/pacman.conf > "$archive"
            pacman --config "$archive" -S --noconfirm --needed $packages
            installed=$?
            rm -f "$archive"
            return $installed ;;
        apk) apk add --update-cache $packages ;;
    esac
}

if [ -n "$packages" ]; then
    [ -n "$manager" ] || fail "Its package manager is not supported"
    install >>"$log" 2>&1 && have qemu-ga && have sshd ||
        fail "$manager could not install$packages"
fi

if [ "$init" = systemd ]; then
    systemctl enable qemu-guest-agent.service >>"$log" 2>&1
else
    rc-update add qemu-guest-agent default >>"$log" 2>&1
fi || fail "The guest agent could not be enabled"

# RHEL-family images do not let the agent run commands, which is how a VM's
# SSH access gets set up. Written in place to keep the file's SELinux label.
if [ -f /etc/sysconfig/qemu-ga ]; then
    filters=$(sed -E \
        -e '/^[^#]*--allow-rpcs=/{/[=,]guest-exec([,"[:space:]]|$)/!s/(--allow-rpcs=[^"[:space:]]*)/\1,guest-exec/;}' \
        -e '/^[^#]*--allow-rpcs=/{/[=,]guest-exec-status([,"[:space:]]|$)/!s/(--allow-rpcs=[^"[:space:]]*)/\1,guest-exec-status/;}' \
        -e '/^[^#]*(--block-rpcs=|BLACKLIST_RPC=)/{s/,?guest-exec(-status)?//g;s/(--block-rpcs=|BLACKLIST_RPC=),/\1/;}' \
        /etc/sysconfig/qemu-ga) && printf '%s\n' "$filters" > /etc/sysconfig/qemu-ga
fi

if [ -z "$had_sshd" ]; then
    # Enabling SSH on a VM starts the server and creates that VM's own host
    # keys. Until then it stays off, and no VM inherits keys made here.
    if [ "$init" = systemd ]; then
        for unit in ssh.service ssh.socket sshd.service sshd.socket; do
            systemctl disable "$unit" >>"$log" 2>&1
        done
    fi
    rm -f /etc/ssh/ssh_host_*
fi

policy=$(sed -n 's/^SELINUXTYPE=[[:space:]]*//p' /etc/selinux/config 2>/dev/null | tail -n 1)
contexts=/etc/selinux/${policy:-targeted}/contexts/files/file_contexts
if [ -f "$contexts" ] && ! grep -Eq '^SELINUX=[[:space:]]*disabled' /etc/selinux/config; then
    # Where the policy confines the agent, it keeps it from touching the SSH
    # server it has to set up: stop enforcing its rules for the agent alone.
    if { matchpathcon -n "$(command -v qemu-ga)" 2>/dev/null || cat "$contexts"; } |
            grep -q virt_qemu_ga_exec_t &&
       ! semodule -l 2>/dev/null | grep -q '^distribox-guest-agent'; then
        module=$(mktemp -d)/distribox-guest-agent.cil
        echo '(typepermissive virt_qemu_ga_t)' > "$module"
        semodule -n -i "$module" >>"$log" 2>&1 ||
            fail "SELinux could not be told to let the guest agent set up SSH"
        rm -rf "${module%/*}"
    fi
    # Files written offline carry no label, and the guest refuses to use them
    # without one.
    [ -n "$packages" ] && changed=/ || changed="/etc/systemd/system /etc/selinux /var/lib/selinux"
    # shellcheck disable=SC2086
    setfiles -e /proc -e /sys -e /dev -e /run "$contexts" $changed >>"$log" 2>&1 ||
        touch /.autorelabel
fi

''' + GUEST_ACCOUNT + r'''
# cloud-init creates the account on first boot.
[ -n "$account" ] || have cloud-init || echo no-account
rm -f "$log"
'''


def _reason(stderr: str) -> str:
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    text = "\n".join(lines)
    if "no operating system was found" in text:
        return "No operating system was found on the disk"
    if "multi-boot" in text:
        return "The disk holds several operating systems"
    for line in lines:
        # The first line a failed script prints is its reason.
        if "error: sh: " in line:
            reason = line.split("error: sh: ", 1)[1].strip()
            if reason:
                return reason[:300]
    return "The disk could not be opened"


def _expose_kvm():
    """Create the KVM device a container is allowed to use but was not given.

    Compose grants access to it without requiring that the host has it.
    Without KVM libguestfs still works, a few times slower.
    """
    try:
        os.mknod("/dev/kvm", 0o660 | stat.S_IFCHR, os.makedev(10, 232))
    except OSError:
        return
    try:
        os.close(os.open("/dev/kvm", os.O_RDWR))
    except OSError:
        # A device that cannot be opened makes libguestfs wait a minute for it.
        os.unlink("/dev/kvm")


def _run_guestfish(overlay: Path) -> subprocess.CompletedProcess:
    _expose_kvm()
    command = [
        "guestfish", "--rw", "--network", "--format=qcow2", "-a", str(overlay),
        "-i", "exists", "/bin/sh", ":", "sh", GUEST_PREPARE,
    ]
    process = subprocess.Popen(
        command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, start_new_session=True,
        env={**os.environ, "LIBGUESTFS_BACKEND": "direct"},
    )
    try:
        stdout, stderr = process.communicate(timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise
    return subprocess.CompletedProcess(
        command, process.returncode, stdout, stderr)


def _unsuitable(image: Path, replace: bool) -> str | None:
    """Why this image must not be opened or rewritten, if so."""
    info = json.loads(subprocess.run(
        ["qemu-img", "info", "--output=json", str(image)],
        check=True, capture_output=True, text=True,
    ).stdout)
    details = info.get("format-specific", {}).get("data", {})
    if "backing-filename" in info or "data-file" in details:
        # QEMU would read or write other host files through it.
        return "The disk depends on another file"
    if replace and info.get("snapshots"):
        # The file that replaces the image would not have them.
        return "The disk has snapshots"
    return None


def _save(overlay: Path, image: Path, replace: bool) -> None:
    if replace:
        # Merging into an image VMs are created from could leave it half
        # written. A new file takes its place instead, in one step; a copy
        # in progress keeps reading the file it opened.
        prepared = image.with_name(f"{image.name}.prepared")
        try:
            subprocess.run(
                ["qemu-img", "convert", "-O", "qcow2",
                 str(overlay), str(prepared)],
                check=True, capture_output=True, text=True,
            )
            with prepared.open("rb") as written:
                os.fsync(written.fileno())
            shutil.copymode(image, prepared)
            owner, current = image.stat(), prepared.stat()
            if (current.st_uid, current.st_gid) != (owner.st_uid, owner.st_gid):
                os.chown(prepared, owner.st_uid, owner.st_gid)
            os.replace(prepared, image)
        finally:
            prepared.unlink(missing_ok=True)
    else:
        subprocess.run(["qemu-img", "commit", "-q", "-d", str(overlay)],
                       check=True, capture_output=True, text=True)


def prepare_for_ssh(image: Path, *, replace: bool = False) -> str | None:
    """Prepare a qcow2 image for SSH. Returns why it could not be, if so.

    The image itself is changed, which only suits one nothing else uses yet.
    With `replace`, the result is a new file that takes the image's place.
    """
    if shutil.which("guestfish") is None:
        return "libguestfs is not installed on this host"
    overlay = image.with_name(f"{image.name}.prepare")
    try:
        unsuitable = _unsuitable(image, replace)
        if unsuitable:
            return unsuitable
        subprocess.run(
            ["qemu-img", "create", "-q", "-f", "qcow2", "-F", "qcow2",
             "-b", str(image.resolve()), str(overlay)],
            check=True, capture_output=True, text=True,
        )
    except subprocess.CalledProcessError as error:
        logger.warning("Could not prepare %s for SSH: %s",
                       image.name, error.stderr.strip())
        overlay.unlink(missing_ok=True)
        return "The disk could not be opened"
    try:
        try:
            result = _run_guestfish(overlay)
        except subprocess.TimeoutExpired:
            return "Preparing the image took too long"
        output = result.stdout.split()
        if result.returncode != 0:
            if output[:1] == ["false"]:
                return "No Linux system was found on the disk"
            logger.warning("Could not prepare %s for SSH:\n%s",
                           image.name, result.stderr.strip())
            return _reason(result.stderr)
        needed = overlay.stat().st_size + (image.stat().st_size if replace else 0)
        if shutil.disk_usage(image.parent).free < needed:
            return "The host has too little disk space left"
        try:
            _save(overlay, image, replace)
        except (subprocess.CalledProcessError, OSError) as error:
            detail = getattr(error, "stderr", None) or str(error)
            raise RuntimeError(
                f"Could not save the prepared image: {detail.strip()}") from error
        if NO_ACCOUNT in output:
            return "It has no user account to sign in to"
        return None
    finally:
        overlay.unlink(missing_ok=True)
