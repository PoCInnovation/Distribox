# Prepare a Distribox host

Distribox runs its application in Docker and uses **the host's** QEMU/libvirt.
Use an x86_64 Linux machine, enable virtualization in its firmware, and install
Docker Engine with the Compose plugin. Docker Desktop on macOS does not expose
host libvirt/KVM to this deployment. Use a Linux machine or a Linux VM instead;
the VM needs nested virtualization for KVM acceleration.

## Run setup

From the repository root, as the user who will operate Distribox:

```bash
bash setup.sh --dry-run
bash setup.sh
```

The script shows each step and command. Package managers retain their native
confirmation behavior; `--yes` accepts prompts where supported. Alpine's APK
applies changes without a confirmation prompt. Setup uses `sudo` when needed.
A direct root login must name an existing non-root operator:
`bash setup.sh --user alice`.

After setup, **log out and back in** to refresh every supplementary group. Setup
does not start an interactive shell. `newgrp` accepts one group and starts a new
shell; `newgrp distribox libvirt` does not apply both memberships.

Continue with the [Quickstart](../README.md#quickstart), or use the dashboard's
slave-node guide. Copy `.env.example` only for a new installation; keep existing
secrets when upgrading. Run `bash setup.sh --check` to diagnose the host without
installing packages or changing configuration. Checks use elevated, read-only
libvirt queries; they can ask for your sudo password.

## What setup changes

- Installs the host QEMU emulator, libvirt clients/drivers, NAT dependencies, and
  firmware. Python build tools and disk-image tools used by the application are
  installed in its container.
- Enables libvirt through the running systemd, OpenRC, or Void runit service
  manager. Existing active monolithic systemd installations stay monolithic.
  Modular installations also get `virtproxyd.socket`: Compose needs its
  `/var/run/libvirt/libvirt-sock` compatibility socket.
- Loads the TUN kernel module if needed and records it in
  `/etc/modules-load.d/60-distribox.conf` for boot. Setup stops if the host cannot
  provide `/dev/net/tun`, which guests need for their network interfaces.
- Preserves an existing `default` network and starts it only if inactive. If no
  definition exists, creates NAT on `virbr0` with subnet `192.168.122.0/24`, then
  enables autostart. Libvirt runs its own dnsmasq; setup does not start a global
  dnsmasq service or expose a remote libvirt TCP listener.
- Adds the operator to `distribox`, `libvirt`, and `kvm` when that group exists.
  Libvirt administration grants broad control over the host's VMs; give it only
  to trusted operators. Distribution polkit rules still govern non-root virsh
  access. The backend connects as root through the local socket.
- Creates `/var/lib/distribox`, `images`, and `vms` with mode `2775` and owner
  `root:distribox`. Changes those directory entries only. Libvirt manages
  individual guest disk ownership; setup does not guess QEMU's account or
  recursively change existing files. Custom storage should use a bind mount,
  as described in the [storage guide](../README.md#store-vm-data-on-another-partition).
- Writes `net.ipv4.tcp_slow_start_after_idle = 0` to
  `/etc/sysctl.d/60-distribox.conf` and applies that file for smoother desktop
  traffic after idle periods.

The installer targets current distributions with their standard repositories
enabled. It uses `os-release` and then `ID_LIKE` for derivatives, rather than
guessing from whichever package manager happens to be installed. Reruns skip
existing groups and preserve network definitions, guest files, and running VMs.
A failed step stops the script with its phase, command, and exit code. Earlier
successful steps remain applied; fix the reported problem and rerun.

## Distribution notes

- **Debian / Ubuntu:** APT installs `qemu-system-x86`, `libvirt-daemon-system`,
  the libvirt clients, `dnsmasq-base`, and OVMF. A package-index update runs first.
- **Arch and derivatives:** Pacman uses `--needed` with `libvirt`,
  `qemu-desktop`, dnsmasq, OVMF, and firewall tools. An existing iptables provider
  is retained. It does not refresh package databases by
  themselves: Arch does not support partial upgrades. If mirrors report missing
  packages, perform your normal full system upgrade, then rerun setup.
- **Fedora / RHEL family:** Uses DNF, with YUM as a fallback, including the KVM
  daemon, network definition, and client subpackages. Compatible repositories
  must provide these packages; enterprise releases can require an additional
  virtualization repository. Review the SELinux section below.
- **openSUSE:** Uses Zypper and explicit QEMU, client, and default-network
  subpackages. Review any AppArmor denials rather than disabling the service.
- **Alpine:** Run with Bash (`apk add bash` first on a minimal installation).
  Installs the QEMU libvirt driver and OpenRC scripts separately. Enables D-Bus,
  log/lock daemons, and libvirtd in that order. The host kernel needs KVM and TUN
  support; a minimal container cannot supply it.
- **Gentoo:** Uses Portage atoms requiring libvirt's `libvirtd`, `qemu`,
  `virt-network`, and `policykit` USE flags, QEMU's `vnc` and x86_64 system
  target, plus `sys-firmware/edk2`. Enable `QEMU_SOFTMMU_TARGETS="x86_64"` in your
  Portage configuration, retaining any existing targets. Review Portage's
  requested USE changes and rerun; setup does not rewrite `package.use` or
  accept unrelated configuration changes. Compilation can take time. Both
  systemd and OpenRC are supported.
- **Void:** Uses XBPS, then enables D-Bus and libvirt runit services through
  `/var/service`. Existing service links are retained. Service startup has a
  bounded wait for supervisor registration and daemon readiness. An existing
  `down` marker blocks setup with instructions so it cannot claim the service
  will start at boot while runit keeps it disabled.
- **Solus:** Uses Eopkg's QEMU/libvirt/dnsmasq packages and systemd services.
- **NixOS:** Use the flake module below. Installing Nix on another distribution
  does not replace that distribution's host package/service setup.

## NixOS flakes

Add this input to your existing host flake. Keep your own pinned nixpkgs input;
Distribox's module uses the package set supplied by your host.

```nix
{
  inputs = {
    # Keep your existing nixpkgs URL and lock file.
    distribox.url = "github:PoCInnovation/Distribox";
  };

  outputs = { nixpkgs, distribox, ... }: {
    nixosConfigurations.my-host = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ./configuration.nix
        distribox.nixosModules.default
        {
          services.distriboxHost.enable = true;
          services.distriboxHost.users = [ "alice" ];
          virtualisation.docker.enable = true;
        }
      ];
    };
  };
}
```

Replace `my-host` and `alice` with your existing configuration and operator
account. For a local checkout, use `distribox.url = "path:/absolute/path/to/Distribox"`.
With a Git checkout, add new module files to Git before evaluating the flake.

Review the build before applying it:

```bash
sudo nixos-rebuild build --flake /etc/nixos#my-host
sudo nixos-rebuild switch --flake /etc/nixos#my-host
bash setup.sh --check
```

The module enables libvirt, declares storage/group/sysctl settings, and uses a
oneshot service to preserve or create, autostart, and activate the default NAT
network. NixOS calls its administration group `libvirtd`; the module uses that
name. DHCP/DNS firewall access is scoped to `virbr0`; for an existing default
network on a different bridge, set `services.distriboxHost.networkInterface`
to its bridge name. It leaves the existing QEMU runtime identity and Docker access policy to
the host. If needed, choose Docker group membership in your host configuration
after reviewing its root-equivalent privileges. Log in again after applying
group changes. `setup.sh` on NixOS prints these instructions; it does not edit
your host flake, install imperative profiles, or run a rebuild.

## Troubleshooting

### Packages or service startup fail

Read the package-manager error above the failed-phase message. Check repository
availability and resolve package/USE conflicts before rerunning. Setup does not
run an unattended full-system upgrade. On systemd hosts, inspect
`systemctl status libvirtd` or `systemctl status virtqemud.socket virtproxyd.socket`
and their journals. On OpenRC use `rc-service libvirtd status`; on Void use
`sv status /var/service/libvirtd` and the service logs.

### Default network will not start

Inspect the existing definition and routes:

```bash
sudo virsh --connect qemu:///system net-dumpxml default
ip route
```

An existing bridge/subnet, VPN route, host firewall, missing TUN driver, or
another DNS listener can prevent startup. Choose a nonconflicting subnet through
libvirt after reviewing guests that already use the network. Setup never
destroys or replaces an existing definition. Keep guest DHCP/DNS and forwarding
allowed by the host firewall; do not flush firewall rules. On NixOS, inspect
`journalctl -u distribox-network` and configure the host firewall declaratively.

### Permission denied on guest disks

Check the path's directory traversal permissions and your libvirt security
policy. QEMU may run as `qemu`, `libvirt-qemu`, `libvirt`, a NixOS-specific user,
or root. Libvirt's default dynamic ownership handles guest disks. A custom
`dynamic_ownership = 0` configuration needs matching ACLs/ownership from the
administrator. Do not run `chmod -R 777` or recursively chown live guest data.

### SELinux or AppArmor denies access

Setup detects SELinux and prints a warning. It does not disable mandatory access
controls or relabel running guest files. For a **new, empty** storage tree on an
SELinux host, have an administrator add a persistent image-storage context and
apply it before creating VMs (install the distribution's semanage tools first):

```bash
sudo semanage fcontext -a -t virt_image_t '/var/lib/distribox(/.*)?'
sudo restorecon -Rv /var/lib/distribox
```

Inspect existing custom rules before adding one. For existing VMs, schedule a
maintenance window and review active sVirt labels before relabeling. Confined
Docker containers can also require a host policy allowing the backend's libvirt
socket and shared image access. Diagnose those denials with the host's audit
tools and approve a targeted policy. Do not add `:z`/`:Z` to the libvirt socket
mount: changing its label can break the host daemon. A successful host check
does not verify Docker's SELinux policy or prove that a guest boots.

For AppArmor, inspect its denial logs and extend the local libvirt policy for
custom paths if necessary. Do not disable AppArmor globally.

### KVM or Docker warning

`/dev/kvm` requires host kernel and firmware support. If unavailable, set
`VIRT_TYPE=qemu` in `.env` for software emulation, which is slower. Verify Docker
with `docker info` and `docker compose version` as the operator who will launch
the application. The installer does not install Docker or add users to its group.

## Validation and references

Run installer regression tests and shell checks without modifying the host:

```bash
python3 -m unittest discover -s tests -v
bash -n setup.sh
shellcheck -x setup.sh tests/test_runit.sh
```

Tests cover distribution dispatch, package commands, dry runs, failed installs,
service selection, network preservation, and safe reruns using command shims.
They complement real-host testing; they cannot emulate KVM, init systems,
firewall rules, or mandatory access controls. Evaluate the Nix module in an
actual NixOS host configuration; an export-only `nix flake check` is insufficient.

CI also exercises fresh service registration and reruns with a real runit
supervisor in an isolated container, and evaluates three NixOS configurations
with `tests/nixos-eval.nix`. To repeat the Nix evaluation with Nix installed:

```bash
nix --extra-experimental-features 'nix-command flakes' eval --impure --json \
  --file tests/nixos-eval.nix --apply 'checks: checks {}'
```

This uses a pinned nixpkgs revision for tests. Deployments still use the host's
own pinned package set.

Package/service details follow the distributions' own sources:
[Fedora](https://fedoraproject.org/wiki/Changes/LibvirtModularDaemons),
[openSUSE](https://doc.opensuse.org/documentation/leap/virtualization/html/book-virtualization/cha-vt-installation.html),
[Alpine](https://gitlab.alpinelinux.org/alpine/aports/-/blob/master/community/libvirt/APKBUILD),
[Gentoo](https://gitweb.gentoo.org/repo/gentoo.git/tree/app-emulation/libvirt),
[Void](https://docs.voidlinux.org/config/containers-and-vms/libvirt.html),
[Solus](https://github.com/getsolus/packages/tree/main/packages/l/libvirt), and
[NixOS](https://github.com/NixOS/nixpkgs/blob/master/nixos/modules/virtualisation/libvirtd.nix).
