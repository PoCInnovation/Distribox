#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Run in a disposable container with Bash and runit installed; no root required.
set -Eeuo pipefail
# shellcheck source=../setup.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/../setup.sh"

test_root=$(mktemp -d)
RUNIT_AVAILABLE=$test_root/available
RUNIT_ENABLED=$test_root/enabled
mkdir -p "$RUNIT_AVAILABLE" "$RUNIT_ENABLED"

cleanup() {
    kill "$supervisor_pid" 2>/dev/null || true
    wait "$supervisor_pid" 2>/dev/null || true
    sv -w 5 force-stop "$RUNIT_ENABLED"/* >/dev/null 2>&1 || true
    sv exit "$RUNIT_ENABLED"/* >/dev/null 2>&1 || true
    rm -rf -- "$test_root"
}

for service in dbus virtlogd virtlockd libvirtd; do
    mkdir -p "$RUNIT_AVAILABLE/$service"
    printf '#!/bin/sh\nexec sleep 300\n' > "$RUNIT_AVAILABLE/$service/run"
    chmod +x "$RUNIT_AVAILABLE/$service/run"
done

runsvdir "$RUNIT_ENABLED" &
supervisor_pid=$!
trap cleanup EXIT
# Ensure runsvdir begins by scanning an empty directory: reproduce the link race.
sleep 1
runit_services
runit_services
for service in dbus virtlogd virtlockd libvirtd; do
    sv check "$RUNIT_ENABLED/$service"
done
printf 'Fresh runit registration and repeated setup passed.\n'
