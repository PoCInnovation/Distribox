#!/bin/sh
# Configure a RHEL-family guest image so Distribox can set up SSH via qemu-ga.
# Runs as root inside the image before SELinux relabelling.
# Keep in sync with uploaded-image handling in backend/app/services/image_preparation.py (GUEST_PREPARE).
set -eu

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

agent=$(command -v qemu-ga 2>/dev/null) || { echo "qemu-ga not installed" >&2; exit 1; }
command -v sshd >/dev/null 2>&1 || { echo "sshd not installed" >&2; exit 1; }

systemctl enable qemu-guest-agent.service

# RHEL-family images restrict qemu-ga RPCs by default; Distribox uses guest-exec
# and guest-exec-status to install the VM's SSH key and start sshd.
# Written in place to keep the file's SELinux label.
if [ -f "/etc/sysconfig/qemu-ga" ]; then
    filters=$(awk '
        function csv_has(csv, target,    n, items, i) {
            n = split(csv, items, ",")
            for (i = 1; i <= n; i++) {
                if (items[i] == target) return 1
            }
            return 0
        }
        function csv_remove(csv,    n, items, i, out) {
            n = split(csv, items, ",")
            out = ""
            for (i = 1; i <= n; i++) {
                if (items[i] == "" || items[i] == "guest-exec" || items[i] == "guest-exec-status") continue
                out = (out == "" ? items[i] : out "," items[i])
            }
            return out
        }
        /^[ \t]*#/ { print; next }
        {
            line = $0
            out = ""
            while (match(line, /(--allow-rpcs=|--block-rpcs=|--blacklist=|BLACKLIST_RPC=)["'\'']?[^"'\'' \t]*/)) {
                out = out substr(line, 1, RSTART - 1)
                tok = substr(line, RSTART, RLENGTH)
                prev = (RSTART > 1 ? substr(line, RSTART - 1, 1) : "")
                line = substr(line, RSTART + RLENGTH)

                if (prev != "" && prev !~ /[ \t"'\''=]/) {
                    out = out tok
                    continue
                }

                eq = index(tok, "=")
                prefix = substr(tok, 1, eq)
                val = substr(tok, eq + 1)
                q = substr(val, 1, 1)
                if (q == "\"" || q == "'\''") {
                    prefix = prefix q
                    val = substr(val, 2)
                }

                if (substr(tok, 1, 13) == "--allow-rpcs=") {
                    # Empty --allow-rpcs= disables filtering in qemu-ga; leave it untouched.
                    if (val != "") {
                        if (!csv_has(val, "guest-exec")) val = val ",guest-exec"
                        if (!csv_has(val, "guest-exec-status")) val = val ",guest-exec-status"
                    }
                } else {
                    val = csv_remove(val)
                }
                out = out prefix val
            }
            print out line
        }
    ' "/etc/sysconfig/qemu-ga")
    printf '%s\n' "$filters" > "/etc/sysconfig/qemu-ga"

    awk '
        function csv_has(csv, target,    n, items, i) {
            n = split(csv, items, ",")
            for (i = 1; i <= n; i++) {
                if (items[i] == target) return 1
            }
            return 0
        }
        /^[ \t]*#/ { next }
        {
            line = $0
            while (match(line, /(--allow-rpcs=|--block-rpcs=|--blacklist=|BLACKLIST_RPC=)["'\'']?[^"'\'' \t]*/)) {
                tok = substr(line, RSTART, RLENGTH)
                prev = (RSTART > 1 ? substr(line, RSTART - 1, 1) : "")
                line = substr(line, RSTART + RLENGTH)
                if (prev != "" && prev !~ /[ \t"'\''=]/) continue

                eq = index(tok, "=")
                val = substr(tok, eq + 1)
                q = substr(val, 1, 1)
                if (q == "\"" || q == "'\''") val = substr(val, 2)

                if (substr(tok, 1, 13) == "--allow-rpcs=") {
                    if (val != "" && (!csv_has(val, "guest-exec") || !csv_has(val, "guest-exec-status"))) {
                        print "Failed to enable guest-exec in /etc/sysconfig/qemu-ga" > "/dev/stderr"
                        exit 1
                    }
                } else if (csv_has(val, "guest-exec") || csv_has(val, "guest-exec-status")) {
                    print "Failed to unblock guest-exec in /etc/sysconfig/qemu-ga" > "/dev/stderr"
                    exit 1
                }
            }
        }
    ' "/etc/sysconfig/qemu-ga"
fi

# Where SELinux confines the guest agent (virt_qemu_ga_t), it cannot touch sshd
# or its config during SSH setup. Make virt_qemu_ga_t permissive while keeping
# SELinux enforcing for the rest of the system.
policy=$(sed -n 's/^SELINUXTYPE=[[:space:]]*//p' "/etc/selinux/config" 2>/dev/null | tail -n 1)
contexts="/etc/selinux/${policy:-targeted}/contexts/files/file_contexts"
if [ -f "/etc/selinux/config" ] && [ -f "$contexts" ] &&
        ! grep -Eq '^SELINUX=[[:space:]]*disabled' "/etc/selinux/config"; then
    confined=0
    if label=$(matchpathcon -n "$agent" 2>/dev/null); then
        case "$label" in
            *virt_qemu_ga_exec_t*) confined=1 ;;
        esac
    elif awk '$1 ~ /(^|\/)qemu-ga$/ && $NF ~ /virt_qemu_ga_exec_t/ { found = 1 } END { exit !found }' "$contexts"; then
        confined=1
    fi
    if [ "$confined" -eq 1 ]; then
        if ! semodule -l 2>/dev/null | grep -Eq '^distribox-guest-agent([[:space:]]|$)'; then
            tmpdir=$(mktemp -d)
            trap 'rm -rf "$tmpdir"' EXIT
            module="$tmpdir/distribox-guest-agent.cil"
            echo '(typepermissive virt_qemu_ga_t)' > "$module"
            semodule -n -i "$module"
            rm -rf "$tmpdir"
            trap - EXIT
        fi
        semodule -l | grep -Eq '^distribox-guest-agent([[:space:]]|$)' || {
            echo "distribox-guest-agent SELinux module was not installed" >&2
            exit 1
        }
    fi
fi
