# Store VM data on another partition

Use `/data` for VM disks and downloaded images by bind-mounting `/data/distribox` at `/var/lib/distribox` **on the host**. Docker and libvirt then share the same files, and existing VM paths still work.

Keep the Compose volume `/var/lib/distribox:/var/lib/distribox` unchanged.

Do this after `setup.sh` and before starting Compose.

## Set up storage on /data

Requires Linux with systemd, Docker Engine, `rsync`, and `/data` mounted through `/etc/fstab`. Run `setup.sh` and configure `.env` first. Back up existing data, and continue only when each command succeeds.

1. **Check the disk.** Confirm `/data` is mounted and has room for the copy:

   ```bash
   findmnt --mountpoint /data
   df -h /data
   sudo du -sh /var/lib/distribox
   ```

   Stop if `/data` is not mounted. This guide assumes `/var/lib/distribox` is an ordinary directory, without custom mounts or storage pools. The destination and backup directories used below must not already exist.

2. **Stop the backend and VMs.** Shut down each Distribox VM and wait until all report `shut off`. Stopping Docker does **not** stop host VMs.

   ```bash
   docker compose --profile master stop backend
   sudo virsh -c qemu:///system list --all
   sudo virsh -c qemu:///system shutdown VM_ID
   ```

   Replace `VM_ID` for each VM. Resume paused VMs before shutting them down.

3. **Copy the data.** These flags preserve sparse disks and file permissions:

   ```bash
   sudo mkdir /data/distribox
   sudo rsync -aHAXS --numeric-ids /var/lib/distribox/ /data/distribox/
   sudo rsync -aHAXScn --numeric-ids --itemize-changes /var/lib/distribox/ /data/distribox/
   ```

   The last command verifies the copy and should print nothing. Fix any errors or differences before moving the original aside:

   ```bash
   sudo mv -T /var/lib/distribox /var/lib/distribox.before-storage-move
   sudo install -d -m 755 /var/lib/distribox
   ```

4. **Mount at boot.** Back up `/etc/fstab`, then add:

   ```fstab
   /data/distribox /var/lib/distribox none bind,x-systemd.requires=data.mount 0 0
   ```

   Run `sudo systemctl edit docker.service` and `sudo systemctl edit libvirtd.service`. Add this to both:

   ```ini
   [Unit]
   Requires=var-lib-distribox.mount
   After=var-lib-distribox.mount
   ```

   This makes both services wait for storage. A missing mount blocks them, including their other workloads. Keep `nofail` off these storage mounts.

5. **Mount and restart.**

   ```bash
   sudo findmnt --verify --verbose
   sudo systemctl daemon-reload
   sudo systemctl start var-lib-distribox.mount
   df -h /data /var/lib/distribox
   docker compose --profile master up -d --force-recreate backend
   docker compose --profile master exec backend df -h /var/lib/distribox
   ```

   Host and container should now report the data partition's capacity. Recreating the backend is necessary: an old container can retain its previous mount. For a fresh install, also start the full application using the [Quickstart](../README.md#quickstart) command.

Check your files and start a VM before removing `/var/lib/distribox.before-storage-move`. That backup still occupies space on the system disk. Verify the mounts after the next reboot.

## Other setups

- **Development or slave:** use profile/service `dev`/`backend-dev` or `slave`/`slave` in the Compose commands.
- **Modular libvirt:** edit `virtqemud.service` instead of `libvirtd.service`.
- **Different mount path:** replace `/data` and find its unit name with `systemd-escape --path --suffix=mount /your/path`.
- **Custom security policies:** preserve file labels and resolve AppArmor or SELinux denials through the host policy. Do not use world-writable permissions.

## Rollback

Stop the backend and all Distribox VMs, then stop `var-lib-distribox.mount`. This also stops Docker and libvirt, so plan downtime for the whole host. Remove the fstab line and the service override lines added above, then reload systemd. Use `rmdir` on the empty mount point, restore the backup to `/var/lib/distribox`, restart services, and recreate the backend. If data changed after migration, copy the current data back while everything is stopped; the backup is stale.

[Mount dependencies](https://www.freedesktop.org/software/systemd/man/latest/systemd.mount.html) · [Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
