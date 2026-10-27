{
  description = "Distribox Linux host configuration";

  # Use the host's pinned nixpkgs; importing this module adds no second package set.
  outputs = { self }: {
    nixosModules.default = import ./nix/host.nix;
  };
}
