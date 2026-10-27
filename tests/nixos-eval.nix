# Evaluate real NixOS systems, rather than only checking the flake's export names.
{ nixpkgs ? builtins.fetchTarball "https://github.com/NixOS/nixpkgs/archive/1f607aa79b6356ed45d3cd3c8079c196e79efa2c.tar.gz" }:
let
  host = extra: import "${nixpkgs}/nixos/lib/eval-config.nix" {
    system = "x86_64-linux";
    modules = [
      ../nix/host.nix
      {
        boot.isContainer = true;
        system.stateVersion = "26.05";
        users.users.alice = {
          isNormalUser = true;
          extraGroups = [ "wheel" ];
        };
      }
      extra
    ];
  };
  enabled = host {
    services.distriboxHost = { enable = true; users = [ "alice" ]; };
  };
  disabled = host { };
  custom = host {
    services.distriboxHost = {
      enable = true;
      users = [ "alice" ];
      networkInterface = "virbr7";
    };
    networking.nftables.enable = true;
    virtualisation.libvirtd.qemu.runAsRoot = false;
    virtualisation.docker.enable = true;
  };
  invalid = host {
    services.distriboxHost = { enable = true; users = [ "root" ]; };
  };
in
assert enabled.config.virtualisation.libvirtd.enable;
assert !(disabled.config.virtualisation.libvirtd.enable);
assert builtins.elem "wheel" enabled.config.users.users.alice.extraGroups;
assert builtins.elem "libvirtd" enabled.config.users.users.alice.extraGroups;
assert builtins.elem "distribox" enabled.config.users.users.alice.extraGroups;
assert builtins.elem 67 enabled.config.networking.firewall.interfaces.virbr0.allowedUDPPorts;
assert builtins.elem 53 custom.config.networking.firewall.interfaces.virbr7.allowedTCPPorts;
assert !(custom.config.virtualisation.libvirtd.qemu.runAsRoot);
assert !(builtins.all (item: item.assertion) invalid.config.assertions);
{
  enabled = enabled.config.system.build.toplevel.drvPath;
  disabled = disabled.config.system.build.toplevel.drvPath;
  nftablesWithCustomBridge = custom.config.system.build.toplevel.drvPath;
}
