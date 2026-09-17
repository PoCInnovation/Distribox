# Distribox

<div align="center">
  <img src=".github/assets/distribox.png" alt="Distribox Logo" width="200"/>
</div>

Distribox is a self-hosted platform for creating, managing, and sharing virtual machines through a simple web interface.

<div align="center">
  <a href="https://youtu.be/eH6qJUTcxvI" target="_blank">
    <img src=".github/assets/demo-thumbnail.png" alt="Distribox Demo" width="600"/>
  </a>
</div>

## Features

---

## VM Creation and Management
Create virtual machines with custom specs: CPU cores, RAM, disk size, and operating system. Control VMs with start, stop, restart, duplicate, rename, and delete. Connect to any VM directly from your browser.

VM disks and downloaded images can live on another mounted partition. Auto selects the available location with the most free space, or hosts can choose a location when creating a VM.

<div align="center">
  <img src=".github/assets/create-vm.png" alt="VM Creation" width="700"/>
</div>

---

## Graphical VM Streaming
Distribox uses Apache Guacamole to stream VM desktops over WebSocket. The browser connects to the backend, which proxies the Guacamole protocol to guacd, which in turn connects to the VM's VNC server. No client-side software required.

<div align="center">
  <img src=".github/assets/vm-streaming.png" alt="VM Streaming" width="700"/>
</div>

---

## Authentication and Authorization
VM streaming is secured through authenticated WebSocket tunnels. Access requires either a JWT token with the appropriate policy, or a credential-based token generated per VM. All traffic between the browser and the VM is mediated by the backend.

---

## Native SSH

Hosts can enable **Allow SSH** for a VM or an event. Recipients then see an **SSH** button beside the web client, with a command to copy, their access secret, and the gateway fingerprint. No additional client software is required beyond an SSH client.

```bash
ssh -p 2222 <credential-id>@distribox.example.com
```

Paste the VM access secret at the password prompt. The gateway supports interactive terminals, remote commands, and SFTP, including modern `scp`. It connects only to the VM assigned to that credential. Disabling SSH, revoking the credential, or reaching its expiry or event deadline closes existing SSH connections within five seconds. SSH port forwarding, agent forwarding, and X11 forwarding are disabled.

SSH is disabled by default. The `vms:ssh:manage` policy controls the host switch; event changes apply to existing and future participant VMs. Duplicated and recovered VMs start with SSH disabled.

---

## Policy-Based Access Control
Distribox uses a policy-based permission system similar to RBAC. Each user is assigned one or more policies that grant access to specific actions (creating VMs, managing users, connecting to VMs, viewing metrics, etc.). If a user lacks a policy, the corresponding feature is hidden and access is denied. Admins have full access by default.

<div align="center">
  <img src=".github/assets/users-and-policies.png" alt="Users and Policies" width="700"/>
</div>

---

## Wide Range of Operating Systems
Supported out of the box:
- Ubuntu 22.04
- Debian 12
- Fedora 43
- CentOS 10
- AlmaLinux 9
- Alpine Linux 3.21
- Arch Linux (rolling)

---

## Distribox Image Registry
OS images are hosted in a remote S3-based registry. When a VM is created, the backend downloads the corresponding image on demand and caches it locally. This keeps the installation lightweight -- no need to bundle large disk images. Image metadata includes revision tracking so updates are fetched automatically.

---

## Master / Slave Architecture
Distribox supports a distributed setup where additional machines act as slave nodes. The master coordinates VM placement and proxies operations to slaves. Slaves report resource availability via periodic heartbeats, and the master routes new VMs to the node with the most available memory. The frontend includes a guided tutorial for registering slave nodes.

<div align="center">
  <img src=".github/assets/slaves-tutorial.png" alt="Slave Registration Tutorial" width="700"/>
</div>

Once connected, each slave node reports its status and resource usage in realtime.

<div align="center">
  <img src=".github/assets/connected-slave.png" alt="Connected Slave Node" width="400"/>
</div>

---

## Realtime Host Metrics
Monitor CPU, memory, and disk usage for the master node, individual slave nodes, or the entire cluster from the dashboard. When provisioning a VM, you can choose which node to deploy on and see its available resources.

<div align="center">
  <img src=".github/assets/provision-target-node.png" alt="Provision Target Node" width="700"/>
</div>

---

## VM Monitor
The monitor view displays periodical screenshots of all virtual machines on the instance. Running VMs show a live preview, and you can click on any of them to connect directly.

<div align="center">
  <img src=".github/assets/monitor-view.png" alt="VM Monitor" width="700"/>
</div>

---

## Events
Events let you distribute a fixed number of VMs with a predefined spec to participants for a set duration. Create an event by choosing an OS, resource allocation, participant limit, and deadline. A shareable link is generated that participants can use to claim their VM.

<div align="center">
  <img src=".github/assets/distribox-events.png" alt="Events Overview" width="700"/>
</div>

Each event page shows its details, the provisioned VMs with live previews, and the list of participants.

<div align="center">
  <img src=".github/assets/distribox-event-page.png" alt="Event Page" width="700"/>
</div>

The share link can be previewed and copied directly from the dashboard.

<div align="center">
  <img src=".github/assets/distribox-event-share-participant-link.png" alt="Event Share Link" width="700"/>
</div>

When an event reaches its deadline, the share link stops working, all VM credentials are revoked, and every virtual machine linked to the event is stopped automatically.

---

## Quickstart

```bash
bash setup.sh

cp .env.example .env

docker compose --profile master up -d --build
```

The application will be available at `localhost:3000`.

For development with hot-reloading:

```bash
docker compose --profile dev up --build
```

To run a slave node on another machine, use the `slave` and follow the guide on the frontend:

### Store VMs on another partition

Open **Settings → Storage**, choose the host, and enable an available mounted partition such as `/data`. Each partition shows its path and available capacity. Give it a name if useful. It becomes available immediately, without a separate command or container restart. Storage management uses the application's `storage:manage` permission; accounts with `storage:get` can view the locations.

When creating a VM, leave **Storage location** on **Auto (most free space)** or choose an enabled location. Downloads and VM disks use that location together. Creation checks space for the image download, the VM disk copy and its growth, plus 1 GiB of headroom. These checks do not reserve future space for sparse disks; monitor free space as VMs grow.

Disabling a location stops new allocations there. Existing VMs and cached images remain available, and their files are never moved or deleted by storage settings. Renaming a location preserves its identity.

The existing Linux `setup.sh` installs the small `distribox-storage` host service alongside libvirt. It discovers supported local filesystems already mounted by the operating system, creates only their dedicated `distribox/images` and `distribox/vms` directories, and exposes those directories under `/var/lib/distribox/storage`. The backend receives new mounts through its existing storage volume. The service listens on a root-only Unix socket and accepts discovered partition IDs; it does not expose a network listener or accept arbitrary paths. Container and host libvirt use the same absolute paths. Docker never receives access to the host root filesystem or Docker socket.

Partitions must already be mounted at persistent paths. This feature does not partition or format disks. The mount may belong to an ordinary user; its parent directories and Distribox's dedicated directories must be root-owned and protected from changes by other accounts. Supported filesystems include ext4, XFS, Btrfs and ZFS; temporary, system and read-only filesystems cannot be enabled. A missing mount or mismatched identity marker blocks use of the location. The host service restores registered mounts on startup and retries returning partitions every 30 seconds.

For an existing installation upgrading to this version, rerun the normal `bash setup.sh` once and recreate the backend with the usual Docker Compose command. Subsequent partition choices happen entirely in Settings. Dynamic partition management requires a Linux host with systemd and Docker Engine; Docker Desktop does not propagate host mounts. The default storage location remains usable without partition management. Previously configured locations retain their existing configuration and mounts.

Back up `/var/lib/distribox/storage.json` and each storage directory, including its `.distribox-storage-id` marker. Keep the original `/var/lib/distribox` directory: it also holds existing VMs, configuration, and the SSH gateway host key. Hosts with custom AppArmor or SELinux rules may need to allow libvirt access to the managed storage paths.

## Configuration

Copy `.env.example` to `.env` and adjust as needed. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DISTRIBOX_MODE` | `master` | `master` or `slave` |
| `MASTER_URL` | - | URL of the master (slave mode only) |
| `SLAVE_API_KEY` | - | API key for slave authentication |
| `ADMIN_USERNAME` | `admin` | Default admin username |
| `ADMIN_PASSWORD` | `admin` | Default admin password |
| `DISTRIBOX_SECRET` | `secret` | Encryption key for sensitive data |
| `BACKEND_PORT` | `8080` | Backend API port |
| `VITE_PORT` | `3000` | Frontend port |

## Deployment

### Reverse Proxy (nginx)

In production, you should place nginx in front of the application to serve both the frontend and backend on a single port. A ready-to-use configuration is provided in [`nginx.conf`](./nginx.conf).

Install it:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/distribox
sudo ln -s /etc/nginx/sites-available/distribox /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

This configuration:
- Listens on port **80** and routes traffic to the frontend (port 3000) and backend (port 8080)
- Proxies WebSocket connections for VM streaming (`/tunnel`)
- All other backend routes (`/auth`, `/vms`, `/images`, etc.) are forwarded to the API

> Note: If you change port configuration for the deployment, we trust you will update the reverse proxy configuration accordingly.

After enabling the reverse proxy, update your `.env` so the frontend calls the backend through nginx instead of directly:

```env
VITE_API_DOMAIN=http://your-domain.com
FRONTEND_URL=http://your-domain.com
```

### Firewall

VNC servers listen on ports 5900-5999 on the host. These must **not** be exposed to the network -- VM streaming is handled securely through the Guacamole WebSocket tunnel. Block external access with your firewall:

```bash
# ufw
sudo ufw deny 5900:5999/tcp

# or iptables
sudo iptables -A INPUT -p tcp --dport 5900:5999 -j DROP
```

### SSH gateway

Set these values in `.env`, then rebuild the backend:

```env
SSH_ENABLED=true
SSH_PORT=2222
SSH_PUBLIC_HOST=distribox.example.com
```

`SSH_PUBLIC_HOST` is the hostname recipients connect to; it defaults to the hostname in `FRONTEND_URL`. Set `SSH_PUBLIC_PORT` only when an external port mapping differs from `SSH_PORT`. The backend uses host networking to reach guests behind libvirt NAT; it listens directly on the configured API and SSH ports. Allow the SSH TCP port through the host firewall; the HTTP reverse proxy does not carry native SSH traffic. The default database hostname is mapped to localhost inside backend containers, where Compose publishes PostgreSQL. Custom database hostnames continue to work.

SSH requires a unique `DISTRIBOX_SECRET` of at least 32 characters on the master and each slave serving SSH VMs. For a new installation, generate one with `openssl rand -hex 32`. Keep existing encryption secrets when upgrading: replacing `DISTRIBOX_SECRET` makes previously encrypted credentials unreadable. Back up `/var/lib/distribox/ssh/host_key`, the per-VM directories, and the encryption secret. The persistent gateway key keeps the fingerprint stable across restarts.

Guests need OpenSSH server, the `user` account, a running QEMU guest agent with `guest-exec` enabled, and an IPv4 DHCP lease on a libvirt-managed network. Updated image builders include OpenSSH. For older or custom images, install and enable those services through the web client first. The gateway prepares a separate key for each VM on its first SSH connection, disables guest password and root SSH login, and verifies guest host keys through the guest agent. Guest keys stay on the server; the browser receives no private key or guest password. The web console login is unchanged.

Slave connections use the existing authenticated management API and a private WebSocket relay. Keep master-to-slave traffic on a trusted, isolated network or an encrypted network tunnel: the current management API uses HTTP and carries both its API token and SSH preparation secrets. Only the master's SSH gateway port needs to be publicly reachable.

New event and VM access secrets use 32 random bytes. Credential IDs alone no longer authorize web connections; share links must contain the access secret. JWT signing now derives a separate signing key from `DISTRIBOX_SECRET` unless `JWT_SECRET_KEY` is explicitly set. Users with sessions signed by the previous default key must log in again. An explicit JWT key must also contain at least 32 characters when SSH is enabled.

### SSL is STRONGLY RECOMMENDED

Distribox should be served over HTTPS. Without SSL:

- **Clipboard will not work.** The browser Clipboard API (`navigator.clipboard`) is only available in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#security_considerations) (HTTPS). Copying VM credentials, event links, or any other data from the dashboard will silently fail on plain HTTP.
- **Pasting into VMs will not work.** The Guacamole client uses the Clipboard API to sync your clipboard with the remote VM. Without HTTPS, you will not be able to paste text into a VM session from your browser.

The easiest way to set up SSL is with [Certbot](https://certbot.eff.org/) (Let's Encrypt):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically modify your nginx configuration to:
- Redirect HTTP (port 80) to HTTPS (port 443)
- Install and renew your TLS certificate

After running Certbot, update your `.env`:

```env
VITE_API_DOMAIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
```

Certbot sets up automatic renewal via a systemd timer. You can verify it with:

```bash
sudo certbot renew --dry-run
```

## Tech Stack

- **Backend:** FastAPI, SQLModel, PostgreSQL, libvirt, KVM/QEMU
- **Frontend:** React Router v7, TypeScript, TailwindCSS v4, shadcn/ui
- **Streaming:** Apache Guacamole (guacd) over WebSocket
- **Containerization:** Docker Compose

## Get Involved

Check out the [contributing guide](./CONTRIBUTING.md).

If you're interested in how the project is organized at a higher level, contact the current project manager.

### Further Documentation

- [Backend](./backend/README.md) -- environment setup and standalone backend configuration
- [Frontend](./frontend/README.md) -- environment setup and standalone frontend configuration
- [Images](./images/README.md) -- guide for building and customizing OS images
- [Atlas](./atlas/README.md) -- syncing tool to upload images to the Distribox registry

## Our PoC team ❤️

Developers
| [<img src=".github/assets/loan.jpeg" width=85><br><sub>Loan Riyanto</sub>](https://github.com/skl1017)
| :---: |

### Manager
| [<img src="https://avatars.githubusercontent.com/lg-epitech" width=85><br><sub>Laurent Gonzalez</sub>](https://github.com/lg-epitech) |
| :---: |

<h2 align=center>
Organization
</h2>

<p align='center'>
    <a href="https://www.linkedin.com/company/pocinnovation/mycompany/">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn logo">
    </a>
    <a href="https://www.instagram.com/pocinnovation/">
        <img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram logo"
>
    </a>
    <a href="https://twitter.com/PoCInnovation">
        <img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" alt="Twitter logo">
    </a>
    <a href="https://discord.com/invite/Yqq2ADGDS7">
        <img src="https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white" alt="Discord logo">
    </a>
</p>
<p align=center>
    <a href="https://www.poc-innovation.fr/">
        <img src="https://img.shields.io/badge/WebSite-1a2b6d?style=for-the-badge&logo=GitHub Sponsors&logoColor=white" alt="Website logo">
    </a>
</p>

> 🚀 Don't hesitate to follow us on our different networks, and put a star 🌟 on `PoC's` repositories

> Made with ❤️ by PoC
