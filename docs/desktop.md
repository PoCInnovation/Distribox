# Desktop streaming

Distribox uses [gliss](https://github.com/lg-epitech/gliss) to stream VM desktops over WebSocket. For each connection, the backend on the VM's host starts a gliss server on its VNC display. Slave hosts send encoded video through their authenticated API to the master, which relays it to the browser. gliss is installed with the backend's Python dependencies. No client-side software required.

## Sound

Enable VM audio with **Enable sound** in the desktop toolbar. Audio shares the authenticated desktop connection and stays off until requested. Existing VMs need a full shutdown and start to add the sound device; see [VM sound](../images/README.md#vm-sound).

## Shared text clipboard

Your system text clipboard is shared with the VM. Copy and paste with your usual shortcuts in either direction; on macOS, Cmd acts as Ctrl in the VM. Your system clipboard is sent to the VM when it opens and whenever you return to it. Only text is shared.

Chromium-based browsers ask for clipboard access when the VM opens. If access is blocked, Distribox tells you and you can allow it in the browser's site settings. Firefox and Safari have no lasting permission: they read the clipboard when you press the paste shortcut and may ask you to confirm. Safari can refuse to copy VM text to your system clipboard.

Guests need `spice-vdagent` running in their desktop session. Without it, the VM cannot share its clipboard. New Ubuntu desktop images and cloud-init seeds install it; for existing/imported desktops, install the `spice-vdagent` package (`sudo apt install spice-vdagent` on Ubuntu or Debian, `sudo pacman -S spice-vdagent` on Arch), then log out and back in. A full shutdown and start adds the guest channel to existing VMs; saved sessions keep their devices. Unsupported hosts keep working without sharing.

Host support requires libvirt 8.4+ and QEMU 6.1+ with SPICE protocol support.

Automatic clipboard reads and writes require the [Clipboard API in a secure context](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#security_considerations), so serve Distribox over HTTPS. Browsers can also require permission or a user gesture.

## Keyboard layouts

When provisioning an imported image, choose a **Keyboard Layout** that matches the desktop inside the image. For a French AZERTY desktop such as GLO-2000 Lab, select **French - AZERTY**. Set your default under **Settings** to preselect it for new VMs. Distribox applies supported layouts to QEMU's VNC keyboard translation on each start, including when restoring a saved desktop session. This works without cloud-init or a guest agent. Images that support cloud-init also receive the keyboard setting inside the guest.

**None (VM default)** leaves the existing VNC keymap unchanged. Imported images keep their guest keyboard settings, so selecting a different layout in Distribox requires matching the layout inside the guest as well.

QEMU has no bundled VNC keymap for Latin American Spanish, Romanian, or Korean. These selections leave the existing VNC mapping unchanged while still configuring the guest through cloud-init when the image supports it.

## Stream settings

| Variable | Default | Description |
|----------|---------|-------------|
| `GLISS_IN_FLIGHT_FRAMES` | `8` | Maximum frames awaiting browser presentation ACKs, from 1 to 8 |
| `GLISS_FPS` | `30` | Capture frame-rate cap, from 1 to 60 |
| `GLISS_H264_BITRATE` | `2000000` | Soft H.264 encoder target, 1000–50000000 bits/second; actual traffic can exceed it |
| `VITE_GLISS_RESOLUTION` | - | Fixed desktop size such as `1920x1080`; empty follows the browser window. Width 640–3840 in multiples of 16, height 480–2160 in multiples of 2. The backend reads it too: recreate it, then stop and start each VM |

Gliss settings apply on the host running the VM. After editing `.env`, recreate the relevant backend container with `docker compose up -d backend` (master) or `docker compose up -d slave` (slave); `docker compose restart` keeps the old environment. Restart the process when running the backend manually. Eight in-flight frames keep 30 fps possible with roughly 250 ms of combined network and browser decode/paint delay. Use a smaller window, such as 4, to limit queued frames on constrained links. Lower `GLISS_FPS` or `GLISS_H264_BITRATE` when actual video traffic exceeds available bandwidth; the bitrate target is not a hard network cap. The backend Docker commands disable WebSocket deflate to avoid recompressing H.264. When launching the backend manually, use `uvicorn app.main:app --host 0.0.0.0 --port 8080 --ws-per-message-deflate false` from `backend/`.

For an opt-in desktop recording panel and local JSON report, see [performance profiling](performance-profiling.md).

## Upgrading slaves

Update slave backends before the master when upgrading desktop streaming. The master requires the slave's `/vms/{vm_id}/desktop/tunnel` WebSocket endpoint; older slaves cannot stream through an updated master. Master-to-slave streaming uses the existing API port and `X-Slave-Token` over the trusted private network. The master retains viewer authorization and resize ownership.

Existing slave VMs may listen only on the private address previously used by the master. Set the slave's `VNC_HOST` to that existing listen address before upgrading; Gliss still connects on the same host. Changing `VNC_LISTEN` or restarting the backend does not rewrite existing VM definitions. Move their VNC listeners to loopback during a planned VM restart, or keep `VNC_HOST` pointed at their current listener. `VNC_LISTEN=127.0.0.1` applies to newly defined VMs.
