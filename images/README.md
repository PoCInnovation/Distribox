# Distribox Images Guide

First of all, you need to install the `libvirt` package on your host system.

Please use the following script, from the repository root, to install the dependencies:

```bash
bash setup.sh
```

> Note: This script supports Debian-based systems, Arch Linux and macOS. Other distributions are in the backlog.

## Create an image

```bash
cd images

chmod +x create-image.sh
./create-image.sh scripts/create-ubuntu.sh
```

The script will run a docker container with the specified image builder and output it to the dist folder.

This is what the script does:
```bash
docker build --build-arg "IMAGE=scripts/$IMAGE" -t qcow2-builder .

mkdir -p dist
docker run --rm \
    --privileged \
    -v $(pwd)/dist:/var/lib/distribox/images \ # This maps the output of the builder to the `dist` folder through a shared volume
    qcow2-builder
```

## Build all images

You can use the `create-image.sh` script to build all images at once:

```bash
cd images
./create-image.sh scripts/*.sh
```

> Note: This script will take a while to run and takes up a lot of disk space (about 2GB per image).

# How to Create a New Distribox Image

This guide explains how to create a new Distribox image.

## 1. Create a new creation script

The first step is to create a new creation script in the `scripts/` directory. The script should be named `create-<distribution>.sh`. For example, `create-newdistro.sh`.

You can use one of the existing scripts as a template. For example, you can copy `create-ubuntu.sh` and modify it to create a new image.

### Anatomy of a creation script

Let's take a look at `create-ubuntu.sh` as an example:

```bash
#!/bin/bash

set -euo pipefail

CLOUD_IMG_URL=https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
DISTRIBOX_IMG_PATH="/var/lib/distribox/images/"
CLOUD_IMG_SOURCE="${CLOUD_IMG_URL##*/}"

wget -O "/tmp/${CLOUD_IMG_SOURCE}" $CLOUD_IMG_URL

sudo qemu-img create -f qcow2 /tmp/resized_image.qcow2 9G
sudo virt-resize --expand /dev/sda1 \
    "/tmp/$CLOUD_IMG_SOURCE" \
    /tmp/resized_image.qcow2

sudo virt-customize -a /tmp/resized_image.qcow2 \
    --network \
    --update \
    --install vim,qemu-guest-agent,cloud-init,xubuntu-desktop \
    --run-command 'update-initramfs -u' \
    --run-command 'update-grub' \
    --run-command 'grub-install /dev/sda'

sudo virt-sysprep -a /tmp/resized_image.qcow2 --operations machine-id,ssh-hostkeys

sudo virt-sparsify --compress /tmp/resized_image.qcow2 \
    "${DISTRIBOX_IMG_PATH}distribox-ubuntu-22.04.qcow2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo cp "${SCRIPT_DIR}/distribox-ubuntu-22-04.metadata.yaml" ${DISTRIBOX_IMG_PATH}

chmod 775 "${DISTRIBOX_IMG_PATH}distribox-ubuntu-22.04.qcow2"

sudo rm -f /tmp/resized_image.qcow2
```

The script does the following:

1.  **Downloads a cloud image:** The `CLOUD_IMG_URL` variable specifies the URL of the cloud image to download.
2.  **Creates a larger qcow2 image:** The `qemu-img create` command creates a new qcow2 image with a specified size.
3.  **Resizes the original cloud image:** The `virt-resize` command resizes the original cloud image into the new larger image.
4.  **Customizes the image:** The `virt-customize` command installs packages, updates the system, and runs other commands.
5.  **Generalizes the image:** The `virt-sysprep` command removes machine-specific information.
6.  **Sparsifies the image:** The `virt-sparsify` command reduces the size of the image.
7.  **Copies the metadata file:** The `cp` command copies the metadata file to the output directory.
8.  **Sets the file permissions:** The `chmod` command sets the file permissions of the image.
9.  **Cleans up temporary files:** The `rm` command removes temporary files.

## 2. Create a new metadata file

The next step is to create a new metadata file in the `scripts/` directory. The metadata file should be named `distribox-<distribution>-<version>.metadata.yaml`. For example, `distribox-newdistro-1.0.metadata.yaml`.

### The metadata file

The metadata file is a YAML file that describes the image. Let's take a look at `distribox-ubuntu-22-04.metadata.yaml` as an example:

> IMPORTANT: The version inside of the metadata **MUST BE separated by a dash**. For example, the version of `distribox-ubuntu-22-04.metadata.yaml` is `22-04` not `22.04`.

```yaml
name: Ubuntu 22.04
image: distribox-ubuntu-22-04.qcow2
version: 22.04
distribution: ubuntu
family: debian
revision: 0
```

The metadata file has the following fields:

*   `name`: The name of the image.
*   `image`: The filename of the image.
*   `version`: The version of the image.
*   `distribution`: The distribution of the image.
*   `family`: The family of the distribution.
*   `revision`: The revision of the image.

## 3. Build the image

Once you have created the creation script and the metadata file, you can build the image using the `create-image.sh` script:

```bash
./create-image.sh scripts/create-newdistro.sh
```

The script will build the image and output it to the `dist/` directory.

## Desktop streaming

Distribox uses [gliss](https://github.com/lg-epitech/gliss) to stream VM desktops directly to the browser. The `gliss-server` package in `backend/requirements.txt` provides the server, so no separate service or build is needed.

### How it works

```
Browser (gliss client served at /gliss/client.js)
  │  WebSocket  ws://backend/tunnel?credential=X
  │
FastAPI backend (Docker, network_mode: host)
  │  starts one gliss-server per connection on 127.0.0.1
  │
gliss-server
  │  VNC  127.0.0.1:590x, or the slave's VNC_LISTEN address
  │
QEMU/KVM VM
```

- The backend stops the connection's gliss server when the browser disconnects.
- The backend serves the browser client from the installed `gliss-server`, so both always match.
- VNC ports stay private. For VMs on a slave, set `VNC_LISTEN` on the slave to an address the master can reach.

### VM sound

Choose **Enable sound** in the desktop toolbar to hear the VM; **Mute sound** stops the audio stream. Each viewer controls their own sound. Audio uses the same authenticated tunnel as the desktop, including for VMs on slaves. Browsers with an Opus decoder receive compressed stereo audio; other browsers use PCM. Serve Distribox over HTTPS for browser media support (localhost also works).

New VMs have an Intel HDA output device and a headless QEMU audio backend. Existing VMs get these devices on their next full shutdown and start. Restarting the guest or restoring saved memory does not add hardware. The guest needs its normal HDA driver and an enabled, unmuted audio output; no additional guest agent or host audio service is required.

Imported VMs keep their existing sound cards and audio backends. Distribox links an unconfigured VNC capture to the sound card's backend; if several backends exist without an explicit sound-card binding, configure the matching `<audio id='…'/>` under the VNC graphics device yourself.

### Display resizing in X11 guests

X11 desktops, such as KDE Plasma on X11, ignore the size the web client requests unless `images/guest/distribox-display-resize` runs at login. Install it into an image before creating VMs from it, or into a stopped VM's disk under `/var/lib/distribox/vms/<id>/`:

```bash
sudo virt-customize -a <disk>.qcow2 \
    --copy-in images/guest/distribox-display-resize:/usr/local/bin \
    --copy-in images/guest/distribox-display-resize.desktop:/etc/xdg/autostart \
    --chmod 0755:/usr/local/bin/distribox-display-resize \
    --chown 0:0:/usr/local/bin/distribox-display-resize \
    --chown 0:0:/etc/xdg/autostart/distribox-display-resize.desktop
```

The guest needs `xrandr` and `udevadm`. Without the helper, the desktop keeps its resolution and the client scales it to fit the window.

### VM OS login credentials

Cloud-init sets the default OS user inside each VM:

- **Username**: `user`
- **Password**: `password`

These are shown as a dismissible hint on the web client when connected.

## Start VM manually and connect

After creating a VM on the frontend, you can start it manually by using the following ``virsh`` command

```bash
virsh -c qemu:///system start <image-id>
```

> Note: you can find the image id by looking at the /var/lib/distribox/vms directory

### Connect via the web client (recommended)

1. Start the VM from the dashboard or via `virsh start <id>`
2. Create a credential in the VM details dialog
3. Go to the Distribox home page, paste the credential password, and click **Connect**
4. The browser opens `/client?credential=X` and streams the desktop via gliss

### Connect via virt-viewer (local debug)

```bash
virt-viewer --connect qemu:///system 916e26d0-358e-43c1-9af6-c95c2c71aec4
```

To stop the VM, you can use the following command

```bash
virsh -c qemu:///system shutdown 01fd7cb3-d4f4-45c2-bd0f-3da1722fc6ac
```

To force the VM to stop if it is not responding, you can use the following command

```bash
virsh -c qemu:///system destroy 01fd7cb3-d4f4-45c2-bd0f-3da1722fc6ac
```

You can see the VM's state manually by running the following command

```bash
virsh -c qemu:///system domstate 01fd7cb3-d4f4-45c2-bd0f-3da1722fc6ac
```

You will need to install the `virt-viewer` package to connect to the VM on your host system, this should be done by the `setup.sh` script but you will have to turn to your package manager for more information if it is not supported.
