{ config, lib, pkgs, ... }:
let
  cfg = config.services.distriboxHost;
in
{
  options.services.distriboxHost = {
    enable = lib.mkEnableOption "the Distribox libvirt host";
    users = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Existing operator accounts granted Distribox storage and libvirt administration access.";
      example = [ "alice" ];
    };
    networkInterface = lib.mkOption {
      type = lib.types.str;
      default = "virbr0";
      description = "Bridge of the default libvirt network, used for guest DHCP and DNS firewall allowances.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !(builtins.elem "root" cfg.users);
        message = "services.distriboxHost.users must contain non-root operator accounts.";
      }
      {
        assertion = pkgs.stdenv.hostPlatform.isx86_64;
        message = "Distribox currently creates x86_64 guests and requires an x86_64 host.";
      }
    ];
    virtualisation.libvirtd.enable = true;
    users.groups.distribox = { };
    users.users = lib.genAttrs cfg.users (_: {
      extraGroups = [ "distribox" "libvirtd" "kvm" ];
    });
    systemd.tmpfiles.rules = [
      "d /var/lib/distribox 2775 root distribox -"
      "d /var/lib/distribox/images 2775 root distribox -"
      "d /var/lib/distribox/vms 2775 root distribox -"
    ];
    boot.kernel.sysctl."net.ipv4.tcp_slow_start_after_idle" = 0;
    networking.firewall.interfaces.${cfg.networkInterface} = {
      allowedUDPPorts = [ 53 67 ];
      allowedTCPPorts = [ 53 ];
    };

    systemd.services.distribox-network = {
      description = "Ensure the Distribox default NAT network is available";
      wantedBy = [ "multi-user.target" ];
      after = [ "libvirtd.service" "firewall.service" ];
      requires = [ "libvirtd.service" ];
      path = [ config.virtualisation.libvirtd.package pkgs.gnugrep ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
      };
      script = ''
        set -eu
        export LC_ALL=C
        networks=$(virsh --connect qemu:///system net-list --all --name)
        if ! printf '%s\n' "$networks" | grep -Fx default >/dev/null; then
          virsh --connect qemu:///system net-define ${../setup/default-network.xml}
        fi
        virsh --connect qemu:///system net-autostart default
        active=$(virsh --connect qemu:///system net-list --name)
        if ! printf '%s\n' "$active" | grep -Fx default >/dev/null; then
          virsh --connect qemu:///system net-start default
        fi
      '';
    };
  };
}
