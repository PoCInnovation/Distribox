# QEMU clipboard transport

Distribox uses a small derivative of `guacamole/guacd:1.6.0`. The daemon and
other protocol plugins come from the upstream image; only its VNC plugin and
LibVNCClient library are rebuilt from checksum-pinned releases.

Two gaps prevent copying text out of a QEMU guest with the upstream image:

- Guacamole 1.6.0 registers the classic clipboard callback but does not register
  `GotXCutTextUTF8`. LibVNCClient advertises Extended Clipboard only when that
  callback is present. QEMU requires this capability to register a clipboard peer.
- LibVNCClient 0.9.15 ignores Extended Clipboard `Notify` messages. QEMU announces
  availability with `Notify` and sends the text only after receiving `Request`.

The patches register the UTF-8 callback, request announced text and prefer
Extended Clipboard when sending UTF-8 text. Classic VNC remains the fallback.
The received Extended Clipboard terminator is removed before sending browser
clipboard text. The existing Guacamole clipboard size limit still applies.

Upstream sources:

- [Guacamole 1.6.0 VNC client](https://github.com/apache/guacamole-server/blob/1.6.0/src/protocols/vnc/vnc.c)
- [Guacamole 1.6.0 clipboard handling](https://github.com/apache/guacamole-server/blob/1.6.0/src/protocols/vnc/clipboard.c)
- [LibVNCClient 0.9.15 negotiation and clipboard handling](https://github.com/LibVNC/libvncserver/blob/LibVNCServer-0.9.15/src/libvncclient/rfbclient.c)
- [QEMU VNC clipboard handling](https://github.com/qemu/qemu/blob/master/ui/vnc-clipboard.c)

## Isolated transport check

From the repository root, with Docker and `qemu-system-x86_64` available:

```sh
docker build -f backend/Dockerfile.guacd -t distribox-guacd-clipboard-test backend
python backend/guacd/test_clipboard_transport.py
```

For a baseline comparison:

```sh
python backend/guacd/test_clipboard_transport.py --image guacamole/guacd:1.6.0
```

The check starts a diskless QEMU process and a temporary guacd container on
unused loopback ports. A second VNC clipboard peer checks Unicode, multiline
and empty text in both directions. A classic-only VNC stub checks that
Guacamole falls back to the configured UTF-8 clipboard encoding when Extended
Clipboard is unavailable. Both processes are removed afterward;
existing VMs and Distribox services are untouched.

This verifies the real Guacamole/QEMU protocol path. Browser permissions,
desktop selection ownership and the guest's `spice-vdagent` still require a
desktop smoke test. It does not claim browser-to-guest end-to-end coverage.
