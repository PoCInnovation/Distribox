# SSH gateway

Hosts can enable **Allow SSH** for a VM or an event. Recipients then see an **SSH** button beside the web client, with a command to copy, their access secret, and the gateway fingerprint. No additional client software is required beyond an SSH client.

```bash
ssh -p 2222 <credential-id>@distribox.example.com
```

Paste the VM access secret at the password prompt. The gateway supports interactive terminals, remote commands, and SFTP, including modern `scp`. It connects only to the VM assigned to that credential. Disabling SSH, revoking the credential, or reaching its expiry or event deadline closes existing SSH connections within five seconds. SSH port forwarding, agent forwarding, and X11 forwarding are disabled.

SSH is disabled by default. The `vms:ssh:manage` policy controls the host switch; event changes apply to existing and future participant VMs. Duplicated and recovered VMs start with SSH disabled.

## Enable the gateway

Set these values in `.env`, then rebuild the backend:

```env
SSH_ENABLED=true
SSH_PORT=2222
SSH_PUBLIC_HOST=distribox.example.com
```

`SSH_PUBLIC_HOST` is the hostname recipients connect to; it defaults to the hostname in `FRONTEND_URL`. Set `SSH_PUBLIC_PORT` only when an external port mapping differs from `SSH_PORT`. The backend uses host networking to reach guests behind libvirt NAT; it listens directly on the configured API and SSH ports. Allow the SSH TCP port through the host firewall; the HTTP reverse proxy does not carry native SSH traffic. The default database hostname is mapped to localhost inside backend containers, where Compose publishes PostgreSQL. Custom database hostnames continue to work.

SSH requires a unique `DISTRIBOX_SECRET` of at least 32 characters on the master and each slave serving SSH VMs. For a new installation, generate one with `openssl rand -hex 32`. Keep existing encryption secrets when upgrading: replacing `DISTRIBOX_SECRET` makes previously encrypted credentials unreadable. Back up `/var/lib/distribox/ssh/host_key`, the per-VM directories, and the encryption secret. The persistent gateway key keeps the fingerprint stable across restarts.

## Guest requirements

Guests need OpenSSH server, a user account, a running QEMU guest agent with `guest-exec` enabled, and an IPv4 DHCP lease on a libvirt-managed network. The guest agent must run as root and have the `org.qemu.guest_agent.0` virtio channel. SSH signs in to the `user` account, or to the image's first regular account when it has none.

Registry images are built with these. If enabling SSH on a VM reports a missing prerequisite, install it in that VM through the web client.

Uploading a Linux image installs the guest agent and OpenSSH server it lacks, with its own package manager and whether or not its VMs use SSH, so the host needs Internet access during the upload. An OpenSSH server installed this way stays off in a VM until **Allow SSH** is turned on for it; one the image came with is left as it is. Where the image's SELinux policy confines the guest agent, as on RHEL-family systems, the agent is also allowed to run commands and SELinux stops enforcing its rules for the agent, which otherwise cannot configure OpenSSH. When an image cannot be prepared, the upload says why, and the image still works in the web client. For an image uploaded before this was automatic, choose it on the provision page and use **Set it up** under **Allow SSH**; this needs free space for a second copy of the image. A VM created earlier keeps its own copy of the disk: install both packages inside it.

Enabling **Allow SSH** on a running VM prepares its key and configuration, enables the SSH service at boot, and reloads or starts it through systemd or OpenRC. Each explicit enable refreshes this setup, even if a previous connection was prepared recently. Setup failures leave access disabled and report the missing prerequisite. Enabling it on a stopped VM saves the preference and reports that setup is pending; the first SSH connection after startup prepares the guest. VMs enabled through an event also use preparation on their first connection.

Guest setup disables password and root SSH login and verifies guest host keys through the guest agent. Guest keys stay on the server; the browser receives no private key or guest password. The web console login is unchanged.

## Slaves

Slave connections use the existing authenticated management API and a private WebSocket relay. Update slave backends before enabling SSH through an updated master: older slaves cannot confirm that they applied the forced preparation. Keep master-to-slave traffic on a trusted, isolated network or an encrypted network tunnel: the current management API uses HTTP and carries both its API token and SSH preparation secrets. Only the master's SSH gateway port needs to be publicly reachable.

## Secrets and sessions

New event and VM access secrets use 32 random bytes. Credential IDs alone no longer authorize web connections; share links must contain the access secret. JWT signing now derives a separate signing key from `DISTRIBOX_SECRET` unless `JWT_SECRET_KEY` is explicitly set. Users with sessions signed by the previous default key must log in again. An explicit JWT key must also contain at least 32 characters when SSH is enabled.
