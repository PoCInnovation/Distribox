# Distribox

<div align="center">
  <img src=".github/assets/distribox.png" alt="Distribox Logo" width="200"/>
</div>

> This project is currently undergoing development, and is not functional as of yet.

Distribox is a self-hosted solution designed to simplify sharing virtual machine (VM) instances with a broader audience. Its main goal is to provide an intuitive web interface that caters to both hosts and users.

In Distribox, the host is the person who deploys the platform on their own machine. The user is anyone who accesses and utilizes the designated VMs provided by the host.

Distribox offers two main interfaces:

1. **User Web Client:** Allows users to connect to a VM directly through their browser, using credentials provided by the host. No additional software is required on the user's end.
2. **Admin Dashboard:** Enables hosts to easily create, manage, and configure VM instances and user credentials. Additional administrative features empower hosts to control access, monitor usage, and handle VM lifecycle operations.

This dual-interface approach ensures both hosts and users have a straightforward, secure, and effective experience with VM sharing.

## How does it work?

Distribox uses the standard Python libvirt API in its backend. The backend runs inside a Docker container, but all virtualization is performed directly on the host machine by sharing the libvirt UNIX socket with the container. For added security, Distribox creates its own user group (similar to how Docker manages its own group for virtualization tasks). This user group is responsible for running the platform and managing virtual machines, which limits permissions and helps prevent unauthorized access.

The virtual machines managed by Distribox are complete, fully isolated VMs—not lightweight or process-isolated Docker containers. This means users can run a wide variety of operating systems and configurations on different VMs, making Distribox suitable for many scenarios.

Libvirt interfaces with KVM (Kernel-based Virtual Machine) as its primary virtualization technology on Linux. KVM is a type-1 hypervisor built directly into the Linux kernel, enabling near-native performance and advanced isolation for VMs. This integration means that Distribox can offer virtual machines that are both performant and secure, leveraging the strengths of KVM for reliable virtualization.

All communication between the user's web client and the virtual machines happens exclusively through the Distribox backend. Users never connect directly to the VM instances themselves; access is strictly managed and mediated by the backend for security and control. This approach maintains a clear separation between the management interface and the actual VMs, helping hosts strictly regulate who can access which resources.

## How to run the application

To start the application in production mode, you can use the `prod` profile:

```bash
docker compose --profile prod up -d --build
```

This will:
*   Build the `backend` service using the `production-stage` in `backend/Dockerfile`.
*   Build the `frontend` service using the `production-stage` in `frontend/Dockerfile`.
*   Start the `database` service.

To start the development environment with automatic rebuilds for both backend and frontend:

```bash
docker compose --profile dev up --build
```

This command will:
*   Build the `backend-dev` service using the `dev-stage` in `backend/Dockerfile`, with `uvicorn --reload`.
*   Mount your local `backend/app` and `backend/.env` directories into the container for hot-reloading.
*   Build the `frontend-dev` service using the `dev-stage` in `frontend/Dockerfile`, with `pnpm dev`.
*   Mount your local `frontend` directory into the container for hot-reloading.
*   Start the `database` service.

## Getting Started


### Installation

An installation script is provided, compatible with multiple Linux distributions. For the skeptics among us, here is a short, non-exhaustive list of dependencies:
- python3
- genisoimage
- qemu-kvm
- libvirt-daemon-system
- libvirt-clients
- bridge-utils
- virtinst
- pkg-config
- libvirt-dev

We recommend running the script to initialize user privileges for the distribox user group.

### Quickstart

It's that easy 🚀
```bash
bash install.sh
docker compose up -d
```

### Usage

Once the application started, you will find your application portal at `localhost:3000`. For further use and deployment we recommend applying a reverse proxy for convenience of your users.

## Permissions

Distribox uses a simple permission system to control what each user can see and do.

- Every account has one or more policies.
- Policies grant access to specific areas or actions (for example viewing hosts, listing VMs, or managing users).
- If a policy is missing, the related feature is hidden or access is refused.
- The default admin account has full access.

## Get involved

You're invited to join this project ! Check out the [contributing guide](./CONTRIBUTING.md).

If you're interested in how the project is organized at a higher level, please contact the current project manager.

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
