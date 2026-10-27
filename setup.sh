#!/usr/bin/env bash
# Host setup only. Application dependencies are built in the backend container.
set -Eeuo pipefail
export LC_ALL=C

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DRY_RUN=false
ASSUME_YES=false
CHECK_ONLY=false
TARGET_USER=
DISTRO=
INIT_SYSTEM=
PHASE=preflight
ROOT=()
LIBVIRT_SOCKET=/var/run/libvirt/libvirt-sock
STORAGE_DIR=/var/lib/distribox
OPENRC_DIR=/etc/init.d
RUNIT_AVAILABLE=/etc/sv
RUNIT_ENABLED=/var/service
TUN_DEVICE=/dev/net/tun

usage() {
    cat <<'EOF'
Usage: bash setup.sh [--dry-run] [--yes] [--user USER] [--check]

Prepare a Linux host for Distribox: install QEMU/libvirt, enable local services
and the default NAT network, create shared storage, and add user groups.

  --dry-run    Print the planned changes without sudo or host modifications.
  --yes, -y    Accept package-manager prompts (including Gentoo builds).
  --user USER  User receiving storage/libvirt access. Defaults to the invoking
               user, or SUDO_USER under sudo. Required for a direct root login.
  --check      Diagnose an existing host without changing it.
  --help, -h   Show this help.

Supported: Debian/Ubuntu, Arch, Fedora/RHEL, openSUSE, Alpine, Gentoo, Void,
Solus, and NixOS (declarative flake module).

Install Docker Engine and Compose separately. On minimal Alpine, install Bash
first. Package managers keep their native prompts; APK applies changes directly.
Log out and back in after setup to apply all group memberships.
EOF
}

info() { printf '\n==> %s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

on_error() {
    printf '\nError during %s (line %s, exit %s): %s\n' "$PHASE" "$2" "$1" "$3" >&2
    printf 'Resolve the error above, then rerun setup. Use --check to inspect the host.\n' >&2
    exit "$1"
}

run() {
    printf '  $'
    printf ' %q' "$@"
    printf '\n'
    if ! "$DRY_RUN"; then "$@"; fi
}

run_root() { run "${ROOT[@]}" "$@"; }
query_root() { "${ROOT[@]}" "$@"; }
virsh_query() { query_root virsh --connect qemu:///system "$@"; }
virsh_run() { run_root virsh --connect qemu:///system "$@"; }
require_command() { command -v "$1" >/dev/null || die "Required command '$1' is missing. $2"; }

parse_args() {
    while (($#)); do
        case "$1" in
            --dry-run) DRY_RUN=true ;;
            --yes|-y) ASSUME_YES=true ;;
            --check) CHECK_ONLY=true ;;
            --user)
                [[ $# -ge 2 && -n $2 && $2 != -* ]] || die '--user requires a username.'
                TARGET_USER=$2
                shift
                ;;
            --help|-h) usage; exit 0 ;;
            *) die "Unknown argument '$1'. Use --help for usage." ;;
        esac
        shift
    done
    if "$CHECK_ONLY" && "$DRY_RUN"; then die 'Use --check or --dry-run separately.'; fi
}

read_os_release() {
    local release_file=${1:-/etc/os-release}
    local ID='' ID_LIKE=''
    [[ -r $release_file ]] || release_file=/usr/lib/os-release
    [[ -r $release_file ]] || die 'Cannot read os-release; the Linux distribution is unknown.'
    # os-release is an administrator-owned shell assignment file.
    # shellcheck disable=SC1090
    . "$release_file"
    local candidate
    for candidate in "${ID:-}" ${ID_LIKE:-}; do
        case "$candidate" in
            nixos) DISTRO=nixos; return ;;
            debian|ubuntu) DISTRO=debian; return ;;
            arch|archlinux) DISTRO=arch; return ;;
            fedora|rhel|centos|rocky|almalinux) DISTRO=fedora; return ;;
            opensuse*|suse|sles) DISTRO=opensuse; return ;;
            alpine|gentoo|void|solus) DISTRO=$candidate; return ;;
        esac
    done
    die "Unsupported distribution '${ID:-unknown}'. No changes made. Use --help for supported systems."
}

detect_platform() {
    [[ $(uname -s) == Linux ]] || die 'Distribox needs a Linux host: its containers use host libvirt and KVM. Use a Linux machine or VM.'
    [[ $(uname -m) == x86_64 ]] || die 'Distribox currently creates x86_64 VMs. Use an x86_64 Linux host; other host architectures need a separate emulator configuration.'
    read_os_release
}

detect_init() {
    if [[ -d /run/systemd/system ]]; then
        INIT_SYSTEM=systemd
        require_command systemctl 'Boot the host with systemd.'
        systemctl show --property=Version --value >/dev/null 2>&1 || die 'Cannot reach the running systemd manager. Run setup on the host, outside a container/chroot.'
    elif [[ -r /run/openrc/softlevel ]] && command -v rc-service >/dev/null && command -v rc-update >/dev/null; then
        INIT_SYSTEM=openrc
    elif [[ $DISTRO == void ]] && command -v sv >/dev/null && [[ -d /var/service ]]; then
        INIT_SYSTEM=runit
    else
        die 'No supported running init system found (systemd, OpenRC, or Void runit). Run this on the host, outside a container/chroot.'
    fi
}

select_user() {
    TARGET_USER=${TARGET_USER:-${SUDO_USER:-$(id -un)}}
    [[ $TARGET_USER != root ]] || die 'Choose a non-root operator with --user USER (or run setup as that user).'
    [[ $TARGET_USER =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*\$?$ ]] || die "Invalid username '$TARGET_USER'."
    id "$TARGET_USER" >/dev/null 2>&1 || die "User '$TARGET_USER' does not exist. Create the operator account first."
    [[ $(id -u "$TARGET_USER") != 0 ]] || die 'The operator account must have a non-root UID.'
}

prepare_privileges() {
    if ((EUID != 0)); then
        require_command sudo 'Install sudo or run sudo bash setup.sh --user USER.'
        ROOT=(sudo)
        if ! "$DRY_RUN"; then sudo -v; fi
    fi
}

install_packages() {
    PHASE='package installation'
    info "Install host packages ($DISTRO)"
    local yes=()
    "$ASSUME_YES" && yes=(-y)
    case "$DISTRO" in
        debian)
            require_command apt-get 'This host must provide apt-get.'
            run_root apt-get update
            run_root apt-get install "${yes[@]}" qemu-system-x86 qemu-utils libvirt-daemon-system libvirt-clients dnsmasq-base ovmf
            ;;
        arch)
            require_command pacman 'This host must provide pacman.'
            yes=()
            "$ASSUME_YES" && yes=(--noconfirm)
            local packages=(libvirt qemu-desktop dnsmasq edk2-ovmf nftables)
            # Keep an existing iptables provider; do not force a conflicting replacement.
            if ! command -v iptables >/dev/null; then packages+=(iptables-nft); fi
            # No database-only refresh: Arch does not support partial upgrades.
            run_root pacman -S --needed "${yes[@]}" "${packages[@]}"
            ;;
        fedora)
            local manager=dnf
            command -v dnf >/dev/null || manager=yum
            require_command "$manager" 'Install dnf or yum first.'
            run_root "$manager" install "${yes[@]}" qemu-kvm qemu-img libvirt-daemon-kvm libvirt-client libvirt-daemon-config-network dnsmasq edk2-ovmf
            ;;
        opensuse)
            require_command zypper 'This host must provide zypper.'
            yes=()
            "$ASSUME_YES" && yes=(--non-interactive)
            run_root zypper "${yes[@]}" install qemu libvirt-daemon-qemu libvirt-client libvirt-daemon-config-network dnsmasq qemu-ovmf-x86_64
            ;;
        alpine)
            require_command apk 'This host must provide apk.'
            run_root apk add libvirt-daemon libvirt-qemu libvirt-daemon-openrc qemu-system-x86_64 qemu-img qemu-modules ovmf dbus polkit
            ;;
        gentoo)
            require_command emerge 'This host must provide Portage.'
            yes=(--ask)
            "$ASSUME_YES" && yes=(--ask=n)
            info 'If Portage requests USE changes, enable the requested flags in package.use and rerun; setup leaves Portage configuration to you.'
            run_root emerge "${yes[@]}" --noreplace 'app-emulation/libvirt[libvirtd,qemu,virt-network,policykit]' 'app-emulation/qemu[vnc,qemu_softmmu_targets_x86_64]' sys-firmware/edk2 sys-apps/dbus
            ;;
        void)
            require_command xbps-install 'This host must provide XBPS.'
            run_root xbps-install -S "${yes[@]}" libvirt qemu dbus polkit
            ;;
        solus)
            require_command eopkg 'This host must provide eopkg.'
            run_root eopkg install "${yes[@]}" qemu libvirt dnsmasq
            ;;
    esac
}

prepare_tun() {
    PHASE='TUN kernel support'
    info 'Ensure guest TAP devices work now and after reboot'
    if [[ ! -c $TUN_DEVICE ]]; then
        require_command modprobe 'Install kmod or enable TUN in the host kernel.'
        run_root modprobe tun
        if ! "$DRY_RUN" && [[ ! -c $TUN_DEVICE ]]; then
            die "TUN is unavailable at $TUN_DEVICE after modprobe. Enable CONFIG_TUN in the host kernel; do not run setup inside a container."
        fi
    fi
    run_root install -d -m 755 /etc/modules-load.d
    if "$DRY_RUN"; then
        info 'Write tun to /etc/modules-load.d/60-distribox.conf for future boots'
    else
        printf 'tun\n' | query_root tee /etc/modules-load.d/60-distribox.conf >/dev/null
    fi
}

unit_exists() {
    local state
    state=$(systemctl show --property=LoadState --value "$1" 2>/dev/null) || return 1
    [[ $state == loaded ]]
}

systemd_services() {
    local service
    run_root systemctl daemon-reload
    if systemctl is-active --quiet libvirtd.service libvirtd.socket; then
        run_root systemctl enable --now libvirtd.service
    elif systemctl is-active --quiet virtqemud.service virtqemud.socket virtproxyd.socket || unit_exists virtqemud.socket; then
        info 'Use modular libvirt with the compatibility socket required by Compose'
        for service in virtlogd virtlockd virtqemud virtnetworkd virtstoraged virtnodedevd virtnwfilterd virtsecretd virtproxyd; do
            if "$DRY_RUN" || unit_exists "$service.socket"; then
                run_root systemctl enable --now "$service.socket"
            elif [[ $service == virtqemud || $service == virtnetworkd || $service == virtproxyd ]]; then
                die "Missing $service.socket; install the QEMU, network, and proxy libvirt drivers."
            fi
        done
    elif "$DRY_RUN" || unit_exists libvirtd.service; then
        run_root systemctl enable --now libvirtd.service
    else
        die 'No libvirt service units were installed. Check the package-manager output.'
    fi
}

openrc_services() {
    local service
    for service in dbus virtlogd virtlockd libvirtd; do
        if "$DRY_RUN" || [[ -x $OPENRC_DIR/$service ]]; then
            run_root rc-update add "$service" default
            run_root rc-service "$service" start
        elif [[ $service == libvirtd || $service == virtlogd ]]; then
            die "Missing OpenRC service '$service'. Install the distribution's libvirt OpenRC package."
        fi
    done
}

runit_services() {
    local service
    local services=(dbus virtlogd virtlockd libvirtd)
    # Preserve a host already using modular daemons.
    if [[ -e $RUNIT_ENABLED/virtqemud || -L $RUNIT_ENABLED/virtqemud ]]; then
        services=(dbus virtlogd virtlockd virtqemud virtnetworkd virtstoraged virtnodedevd virtnwfilterd virtsecretd virtproxyd)
    fi
    for service in "${services[@]}"; do
        local service_path=$RUNIT_AVAILABLE/$service
        if [[ -e $RUNIT_ENABLED/$service || -L $RUNIT_ENABLED/$service ]]; then service_path=$RUNIT_ENABLED/$service; fi
        if ! "$DRY_RUN" && [[ ! -d $service_path ]]; then die "Missing runit service $service_path (check for a dangling link)."; fi
        if [[ -e $service_path/down ]]; then
            die "$service is disabled by $service_path/down. Review and remove that marker before enabling it at boot."
        fi
        if [[ ! -e $RUNIT_ENABLED/$service && ! -L $RUNIT_ENABLED/$service ]]; then
            run_root ln -s "$RUNIT_AVAILABLE/$service" "$RUNIT_ENABLED/$service"
        fi
        if ! "$DRY_RUN"; then
            # runsvdir scans new links asynchronously; sv's -w does not wait for it.
            local attempt
            for ((attempt=0; attempt<30; attempt++)); do
                if query_root test -p "$RUNIT_ENABLED/$service/supervise/ok"; then break; fi
                sleep 1
            done
            ((attempt < 30)) || die "runit did not supervise $service within 30 seconds. Check runsvdir and the enabled-service link."
        fi
        run_root sv -w 30 up "$RUNIT_ENABLED/$service"
    done
}

enable_services() {
    PHASE='service startup'
    info "Enable local libvirt ($INIT_SYSTEM); existing guests are not restarted"
    case "$INIT_SYSTEM" in
        systemd) systemd_services ;;
        openrc) openrc_services ;;
        runit) runit_services ;;
    esac
}

wait_for_libvirt() {
    PHASE='libvirt readiness'
    info 'Wait for the local libvirt API (up to 60 seconds)'
    if "$DRY_RUN"; then return; fi
    require_command virsh 'Install the distribution libvirt client package.'
    require_command timeout 'Install coreutils or BusyBox timeout for bounded daemon checks.'
    local attempt output=
    for ((attempt=0; attempt<20; attempt++)); do
        if [[ -S $LIBVIRT_SOCKET ]] && output=$(query_root timeout 2 virsh --connect qemu:///system list --all 2>&1); then return; fi
        if ((attempt < 19)); then sleep 1; fi
    done
    # Keep the final daemon error visible, without an unbounded diagnostic query.
    if [[ -n $output ]]; then printf '%s\n' "$output" >&2; fi
    die "Libvirt readiness checks failed after the retry window (expected $LIBVIRT_SOCKET). Inspect the service logs before rerunning setup."
}

configure_network() {
    PHASE='default NAT network'
    info 'Ensure the default libvirt network exists, starts now, and starts at boot'
    if "$DRY_RUN"; then
        info 'If default is missing, define the bundled NAT network (virbr0, 192.168.122.0/24). Existing definitions are preserved.'
        virsh_run net-define "$SCRIPT_DIR/setup/default-network.xml"
        virsh_run net-autostart default
        virsh_run net-start default
        return
    fi
    # List first: a failed connection must never be mistaken for a missing network.
    local networks active
    networks=$(virsh_query net-list --all --name)
    if ! printf '%s\n' "$networks" | grep -Fx default >/dev/null; then
        virsh_run net-define "$SCRIPT_DIR/setup/default-network.xml"
    fi
    virsh_run net-autostart default
    active=$(virsh_query net-list --name)
    if ! printf '%s\n' "$active" | grep -Fx default >/dev/null; then virsh_run net-start default; fi
}

configure_groups() {
    PHASE='operator groups'
    info "Grant $TARGET_USER storage and libvirt administration access"
    local group groups=(distribox libvirt)
    if getent group kvm >/dev/null; then groups+=(kvm); fi
    for group in "${groups[@]}"; do
        if ! getent group "$group" >/dev/null; then
            if command -v groupadd >/dev/null; then run_root groupadd "$group"
            else run_root addgroup -S "$group"; fi
        fi
        if id -nG "$TARGET_USER" | tr ' ' '\n' | grep -Fxq "$group"; then continue; fi
        if command -v usermod >/dev/null; then run_root usermod -aG "$group" "$TARGET_USER"
        else run_root addgroup "$TARGET_USER" "$group"; fi
    done
}

configure_storage() {
    PHASE='shared storage'
    info 'Prepare shared directories; existing VM files keep their ownership and permissions'
    local directory
    for directory in "$STORAGE_DIR" "$STORAGE_DIR/images" "$STORAGE_DIR/vms"; do
        [[ ! -L $directory ]] || die "$directory is a symlink. Use a bind mount for custom storage; see the storage section in README.md."
    done
    run_root install -d -m 2775 -o root -g distribox "$STORAGE_DIR" "$STORAGE_DIR/images" "$STORAGE_DIR/vms"
    # QEMU identities differ by distro. Libvirt manages individual disk ownership.
    if command -v getenforce >/dev/null && [[ $(getenforce) != Disabled ]]; then
        warn 'SELinux is enabled. Configure image-storage labels and backend access to the libvirt socket before starting VMs; see README.md.'
    fi
}

configure_sysctl() {
    PHASE='remote desktop TCP tuning'
    info 'Keep TCP congestion windows across idle desktop sessions'
    run_root install -d -m 755 /etc/sysctl.d
    if "$DRY_RUN"; then
        info 'Write net.ipv4.tcp_slow_start_after_idle = 0 to /etc/sysctl.d/60-distribox.conf'
    else
        printf 'net.ipv4.tcp_slow_start_after_idle = 0\n' | query_root tee /etc/sysctl.d/60-distribox.conf >/dev/null
    fi
    run_root sysctl -q -p /etc/sysctl.d/60-distribox.conf
}

check_host() {
    PHASE='host verification'
    info 'Verify the host connection and default network'
    if "$DRY_RUN"; then
        virsh_run list --all
        return
    fi
    require_command virsh 'Install the libvirt client package.'
    [[ -S $LIBVIRT_SOCKET ]] || die "The compatibility socket $LIBVIRT_SOCKET is missing; Compose cannot reach libvirt."
    virsh_query list --all >/dev/null
    virsh_query domcapabilities --arch x86_64 --machine pc --virttype qemu >/dev/null
    [[ -c $TUN_DEVICE ]] || die "Missing TUN device $TUN_DEVICE. Enable the host's tun kernel module before starting guests."
    local active
    active=$(virsh_query net-list --name)
    printf '%s\n' "$active" | grep -Fx default >/dev/null || die "The libvirt 'default' network is inactive. Inspect its definition with virsh net-dumpxml default, host routes, firewall, and daemon logs."
    local directory
    for directory in "$STORAGE_DIR" "$STORAGE_DIR/images" "$STORAGE_DIR/vms"; do
        [[ -d $directory ]] || die "Missing storage directory $directory."
    done
    [[ -c /dev/kvm ]] || warn 'KVM is unavailable. Enable CPU virtualization/nested virtualization, or set VIRT_TYPE=qemu in .env for slower software emulation.'
    if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
        warn 'Install Docker Engine and the Compose plugin separately before starting Distribox.'
    elif ! docker info >/dev/null 2>&1; then
        warn 'Docker is not reachable as the current user. Start Docker and arrange access before starting Compose.'
    fi
}

nixos_instructions() {
    cat <<'EOF'

NixOS hosts are configured declaratively. No host changes were made.

Add the Distribox flake input to your existing host flake:
  inputs.distribox.url = "github:PoCInnovation/Distribox";

Add to your nixosSystem modules (with distribox in your outputs arguments):
  distribox.nixosModules.default
  {
    services.distriboxHost.enable = true;
    services.distriboxHost.users = [ "YOUR_USER" ];
    virtualisation.docker.enable = true;
  }

Review and apply your host configuration with nixos-rebuild switch --flake.
Log out and back in, then run: bash setup.sh --check
For a local checkout, use inputs.distribox.url = "path:/absolute/path/to/Distribox".
For a customized default network bridge, set services.distriboxHost.networkInterface
to that bridge's name. Keep your existing QEMU runtime identity and Docker policy.
EOF
}

main() {
    trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
    parse_args "$@"
    detect_platform
    if [[ $DISTRO == nixos ]] && ! "$CHECK_ONLY"; then nixos_instructions; return; fi
    if "$CHECK_ONLY"; then
        prepare_privileges
        check_host
        info 'Host checks passed. Docker/KVM warnings above still need attention.'
        return
    fi
    select_user
    detect_init
    info "Distribox host setup: $DISTRO / $INIT_SYSTEM / operator $TARGET_USER"
    if "$DRY_RUN"; then info 'Dry run: commands below are a plan; no changes or privilege prompts.'; fi
    prepare_privileges
    install_packages
    prepare_tun
    enable_services
    wait_for_libvirt
    configure_network
    configure_groups
    configure_storage
    configure_sysctl
    check_host
    if "$DRY_RUN"; then
        info 'Dry run complete. Service and network choices are checked again after installation.'
    else
        info 'Host setup complete. Log out and back in to apply all user group changes.'
        printf 'Next: configure .env, then run docker compose --profile master up -d --build\n'
        printf 'For a slave node use the dashboard setup guide.\n'
    fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
