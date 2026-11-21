#!/bin/sh
# Configure a RHEL-family guest image so Distribox can set up SSH via qemu-ga.
# Runs as root inside the image before SELinux relabelling.
# Parallels uploaded-image handling in backend/app/services/image_preparation.py (GUEST_PREPARE),
# using option-scoped RPC editing and stricter SELinux confinement checks.
set -eu

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

agent=$(command -v qemu-ga 2>/dev/null) || { echo "qemu-ga not installed" >&2; exit 1; }
command -v sshd >/dev/null 2>&1 || { echo "sshd not installed" >&2; exit 1; }

systemctl enable qemu-guest-agent.service

run_rpc_filter_awk() {
    awk -v mode="$1" '
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
        function at_boundary(before, prev) {
            if (prev == "" || prev ~ /[ \t"'\'']/) return 1
            if (prev == "=" && before ~ /^[ \t]*(export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*=$/) return 1
            return 0
        }
        /^[ \t]*#/ {
            if (mode == "edit") print
            next
        }
        {
            line = $0
            out = ""
            while (match(line, /(--allow-rpcs=|--block-rpcs=|--blacklist=|BLACKLIST_RPC=)["'\'']?[^"'\'' \t\r]*/)) {
                lead = substr(line, 1, RSTART - 1)
                tok = substr(line, RSTART, RLENGTH)
                before = out lead
                prev = (length(before) > 0 ? substr(before, length(before), 1) : "")
                out = before
                line = substr(line, RSTART + RLENGTH)

                if (!at_boundary(before, prev)) {
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
                    if (mode == "edit") {
                        if (val != "") {
                            sub(/,+$/, "", val)
                            if (!csv_has(val, "guest-exec")) {
                                val = (val == "" ? "guest-exec" : val ",guest-exec")
                            }
                            if (!csv_has(val, "guest-exec-status")) {
                                val = val ",guest-exec-status"
                            }
                        }
                    } else if (val != "" && (!csv_has(val, "guest-exec") || !csv_has(val, "guest-exec-status"))) {
                        exit 2
                    }
                } else {
                    if (mode == "edit") {
                        val = csv_remove(val)
                    } else if (csv_has(val, "guest-exec") || csv_has(val, "guest-exec-status")) {
                        exit 3
                    }
                }
                out = out prefix val
            }
            if (mode == "edit") print out line
        }
    ' "$2"
}

# RHEL-family images restrict qemu-ga RPCs by default; Distribox uses guest-exec
# and guest-exec-status to install the VM's SSH key and start sshd.
# Written in place to keep the file's SELinux label.
if [ -f "/etc/sysconfig/qemu-ga" ]; then
    filters=$(run_rpc_filter_awk edit "/etc/sysconfig/qemu-ga")
    printf '%s\n' "$filters" > "/etc/sysconfig/qemu-ga"

    rc=0
    run_rpc_filter_awk verify "/etc/sysconfig/qemu-ga" || rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "Failed to enable guest-exec in /etc/sysconfig/qemu-ga" >&2
        exit 1
    elif [ "$rc" -eq 3 ]; then
        echo "Failed to unblock guest-exec in /etc/sysconfig/qemu-ga" >&2
        exit 1
    elif [ "$rc" -ne 0 ]; then
        exit "$rc"
    fi
fi

# Where SELinux confines the guest agent (virt_qemu_ga_t), it cannot touch sshd
# or its config during SSH setup. Make virt_qemu_ga_t permissive while keeping
# SELinux enforcing for the rest of the system.
if [ -f "/etc/selinux/config" ]; then
    selinux_mode=$(awk -F= '/^[ \t]*SELINUX[ \t]*=/ { v = $2; sub(/[ \t]*#.*$/, "", v); gsub(/^[ \t\r"'\'']+|[ \t\r"'\'']+$/, "", v); res = v } END { print res }' "/etc/selinux/config")
    if [ -n "$selinux_mode" ] && [ "$selinux_mode" != "disabled" ]; then
        policy=$(awk -F= '/^[ \t]*SELINUXTYPE[ \t]*=/ { v = $2; sub(/[ \t]*#.*$/, "", v); gsub(/^[ \t\r"'\'']+|[ \t\r"'\'']+$/, "", v); res = v } END { print res }' "/etc/selinux/config")
        contexts="/etc/selinux/${policy:-targeted}/contexts/files/file_contexts"
        confined=0
        if label=$(matchpathcon -n "$agent" 2>/dev/null); then
            case "$label" in
                *virt_qemu_ga_exec_t*) confined=1 ;;
            esac
        elif [ -f "$contexts" ]; then
            if awk '!/^[ \t]*#/ && $1 ~ /(^|\/)qemu-ga$/ && $NF ~ /virt_qemu_ga_exec_t/ { found = 1 } END { exit !found }' "$contexts"; then
                confined=1
            fi
        else
            echo "SELinux is enabled ($selinux_mode) but $contexts is missing and matchpathcon failed" >&2
            exit 1
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
fi
