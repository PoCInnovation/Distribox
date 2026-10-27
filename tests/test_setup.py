"""Exercise the real Bash flow with host mutations replaced by a recording shim.

No test needs root, an installed libvirt daemon, or a distro package manager.
"""
import json
import os
from pathlib import Path
import shlex
import socket
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[1]


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.log = self.path / "commands"
        self.state = self.path / "state"
        self.state.write_text(json.dumps({"defined": True, "active": True}))
        shim = self.path / "shim.py"
        shim.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
with open(os.environ["TEST_LOG"], "a") as log:
    log.write(json.dumps(args) + "\\n")
if os.environ.get("FAIL_COMMAND") == args[0]:
    sys.exit(23)
if args[0] != "virsh":
    sys.exit(0)
path = pathlib.Path(os.environ["TEST_STATE"])
state = json.loads(path.read_text())
op = args[3]
if op == "net-list":
    if os.environ.get("FAIL_QUERY"):
        sys.exit(24)
    if state["defined"] and ("--all" in args or state["active"]):
        print("default")
elif op == "net-define":
    if state["defined"]:
        sys.exit(25)
    state["defined"] = True
elif op == "net-start":
    if state["active"]:
        sys.exit(26)
    state["active"] = True
path.write_text(json.dumps(state))
''')
        shim.chmod(0o755)
        self.shim = shim

    def bash(self, script, *, env=None):
        environment = dict(os.environ, TEST_LOG=str(self.log), TEST_STATE=str(self.state))
        environment.update(env or {})
        return subprocess.run(
            ["bash", "-c", f"source {shlex.quote(str(REPO / 'setup.sh'))}\n" + script],
            text=True, capture_output=True, env=environment, timeout=10,
        )

    def harness(self, extra=""):
        return f'''
require_command() {{ :; }}
run_root() {{ run {shlex.quote(str(self.shim))} "$@"; }}
query_root() {{ {shlex.quote(str(self.shim))} "$@"; }}
prepare_privileges() {{ :; }}
detect_platform() {{ DISTRO=debian; }}
detect_init() {{ INIT_SYSTEM=systemd; }}
select_user() {{ TARGET_USER=operator; }}
prepare_tun() {{ :; }}
wait_for_libvirt() {{ :; }}
check_host() {{ if ! "$DRY_RUN"; then virsh_query list --all >/dev/null; fi; }}
systemctl() {{
    if [[ $1 == is-active ]]; then return 1; fi
    if [[ $1 == show ]]; then echo loaded; return; fi
    return 90
}}
getent() {{ return 1; }}
id() {{ echo operator; }}
{extra}
'''

    def commands(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def assert_ok(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_help_and_bad_arguments(self):
        result = subprocess.run(["bash", str(REPO / "setup.sh"), "--help"], capture_output=True, text=True)
        self.assert_ok(result)
        self.assertIn("--dry-run", result.stdout)
        for args in ("--user", "--user --yes", "--wat", "--check --dry-run"):
            with self.subTest(args=args):
                result = self.bash(f"main {args}")
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.log.exists())

    def test_os_release_detection_including_derivatives(self):
        for distro, like, expected in (
            ("ubuntu", "debian", "debian"), ("arch", "", "arch"),
            ("fedora", "", "fedora"), ("rocky", "rhel fedora", "fedora"),
            ("opensuse-tumbleweed", "opensuse suse", "opensuse"),
            ("alpine", "", "alpine"), ("gentoo", "", "gentoo"),
            ("void", "", "void"), ("solus", "", "solus"),
            ("nixos", "", "nixos"), ("linuxmint", "ubuntu debian", "debian"),
        ):
            with self.subTest(distro=distro):
                release = self.path / "os-release"
                release.write_text(f'ID={distro}\nID_LIKE="{like}"\n')
                result = self.bash(f"read_os_release {shlex.quote(str(release))}\nprintf '%s' \"$DISTRO\"")
                self.assert_ok(result)
                self.assertEqual(result.stdout, expected)

    def test_unsupported_os_and_macos_fail_before_mutations(self):
        release = self.path / "os-release"
        release.write_text("ID=unknown\n")
        result = self.bash(f"read_os_release {shlex.quote(str(release))}")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No changes made", result.stderr)
        result = self.bash("uname() { echo Darwin; }; main")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Linux host", result.stderr)
        self.assertEqual(self.commands(), [])

    def test_nixos_never_runs_imperative_installation(self):
        result = self.bash(self.harness("detect_platform() { DISTRO=nixos; }") + "main --yes")
        self.assert_ok(result)
        self.assertIn("nixosModules.default", result.stdout)
        self.assertEqual(self.commands(), [])

    def test_every_package_manager_and_yes_flag(self):
        expected = {
            "debian": ("apt-get", "-y", "libvirt-daemon-system"),
            "arch": ("pacman", "--noconfirm", "--needed"),
            "fedora": ("dnf", "-y", "libvirt-daemon-config-network"),
            "opensuse": ("zypper", "--non-interactive", "libvirt-daemon-qemu"),
            "alpine": ("apk", "add", "libvirt-daemon-openrc"),
            "gentoo": ("emerge", "--ask=n", "app-emulation/libvirt[libvirtd,qemu,virt-network,policykit]"),
            "void": ("xbps-install", "-y", "libvirt"),
            "solus": ("eopkg", "-y", "libvirt"),
        }
        for distro, tokens in expected.items():
            with self.subTest(distro=distro):
                self.log.unlink(missing_ok=True)
                result = self.bash(self.harness("dnf() { :; }") + f"DISTRO={distro}; ASSUME_YES=true; install_packages")
                self.assert_ok(result)
                command = self.commands()[-1]
                for token in tokens:
                    self.assertIn(token, command)
                self.assertNotIn("-Sy", command)

    def test_yum_fallback(self):
        result = self.bash(self.harness('''command() {
    if [[ $1 == -v && $2 == dnf ]]; then return 1; fi
    builtin command "$@"
}''') + "DISTRO=fedora; install_packages")
        self.assert_ok(result)
        self.assertEqual(self.commands()[0][0], "yum")

    def test_dry_run_never_queries_privileged_commands(self):
        result = self.bash(self.harness() + "main --dry-run --yes")
        self.assert_ok(result)
        self.assertEqual(self.commands(), [])
        self.assertIn("Dry run complete", result.stdout)
        self.assertIn("virtproxyd.socket", result.stdout)

    def test_package_failure_stops_before_services_and_reports_phase(self):
        result = self.bash(self.harness() + "main --yes", env={"FAIL_COMMAND": "apt-get"})
        self.assertEqual(result.returncode, 23)
        self.assertEqual([c[0] for c in self.commands()], ["apt-get"])
        self.assertIn("package installation", result.stderr)
        self.assertNotIn("setup complete", result.stdout)

    def test_active_monolithic_services_are_preserved(self):
        result = self.bash(self.harness('''systemctl() {
    [[ $1 == is-active && $* == *libvirtd* ]]
}''') + "systemd_services")
        self.assert_ok(result)
        self.assertEqual(self.commands(), [
            ["systemctl", "daemon-reload"],
            ["systemctl", "enable", "--now", "libvirtd.service"],
        ])

    def test_modular_services_include_compose_proxy_and_network(self):
        result = self.bash(self.harness() + "systemd_services")
        self.assert_ok(result)
        units = [c[-1] for c in self.commands()[1:]]
        self.assertIn("virtproxyd.socket", units)
        self.assertIn("virtnetworkd.socket", units)
        self.assertNotIn("libvirtd.service", units)

    def test_missing_modular_network_driver_fails(self):
        result = self.bash(self.harness('''systemctl() {
    if [[ $1 == is-active ]]; then return 1; fi
    if [[ $* == *virtnetworkd.socket ]]; then echo not-found; else echo loaded; fi
}''') + "systemd_services")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing virtnetworkd.socket", result.stderr)

    def test_existing_active_network_is_not_redefined_or_restarted(self):
        result = self.bash(self.harness() + "configure_network")
        self.assert_ok(result)
        ops = [c[3] for c in self.commands()]
        self.assertEqual(ops, ["net-list", "net-autostart", "net-list"])

    def test_missing_network_is_created_once_and_reruns_are_safe(self):
        self.state.write_text(json.dumps({"defined": False, "active": False}))
        result = self.bash(self.harness() + "configure_network; configure_network")
        self.assert_ok(result)
        ops = [c[3] for c in self.commands()]
        self.assertEqual(ops.count("net-define"), 1)
        self.assertEqual(ops.count("net-start"), 1)

    def test_network_connection_failure_never_defines_a_replacement(self):
        result = self.bash(self.harness() + 'trap \'on_error "$?" "$LINENO" "$BASH_COMMAND"\' ERR\nconfigure_network', env={"FAIL_QUERY": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([c[3] for c in self.commands()], ["net-list"])
        self.assertIn("default NAT network", result.stderr)

    def test_large_network_lists_preserve_existing_network(self):
        result = self.bash(self.harness('''virsh_query() {
    printf 'default\\n'
    for ((n=0; n<10000; n++)); do printf 'other-network-%030d\\n' "$n"; done
}''') + "configure_network")
        self.assert_ok(result)
        self.assertEqual([c[3] for c in self.commands()], ["net-autostart"])

    def test_failed_unit_query_does_not_invent_modular_units(self):
        result = self.bash(self.harness("systemctl() { return 1; }") + "systemd_services")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No libvirt service units", result.stderr)

    def test_storage_does_not_recursively_change_existing_disks(self):
        result = self.bash(self.harness() + "configure_storage")
        self.assert_ok(result)
        commands = self.commands()
        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0][:8], ["install", "-d", "-m", "2775", "-o", "root", "-g", "distribox"])
        self.assertNotIn("-R", commands[0])

    def test_symlink_storage_is_rejected_before_directory_mutations(self):
        storage = self.path / "storage"
        storage.mkdir()
        (storage / "images").symlink_to(self.path)
        result = self.bash(self.harness() + f"STORAGE_DIR={shlex.quote(str(storage))}; configure_storage")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)
        self.assertEqual(self.commands(), [])

    def test_openrc_services_start_in_dependency_order(self):
        init = self.path / "init.d"
        init.mkdir()
        for name in ("dbus", "virtlogd", "virtlockd", "libvirtd"):
            service = init / name
            service.touch(mode=0o755)
        result = self.bash(self.harness() + f"OPENRC_DIR={shlex.quote(str(init))}; openrc_services")
        self.assert_ok(result)
        self.assertEqual(self.commands(), [
            command
            for name in ("dbus", "virtlogd", "virtlockd", "libvirtd")
            for command in (["rc-update", "add", name, "default"], ["rc-service", name, "start"])
        ])

    def test_runit_retains_existing_links_and_checks_boot_disable_marker(self):
        available = self.path / "sv"
        enabled = self.path / "enabled"
        available.mkdir()
        enabled.mkdir()
        for name in ("dbus", "virtlogd", "virtlockd", "libvirtd"):
            service = available / name
            (service / "supervise").mkdir(parents=True)
            os.mkfifo(service / "supervise/ok")
            (enabled / name).symlink_to(service)
        setup = self.harness() + f"RUNIT_AVAILABLE={shlex.quote(str(available))}; RUNIT_ENABLED={shlex.quote(str(enabled))}\n"
        result = self.bash(setup + "runit_services")
        self.assert_ok(result)
        self.assertFalse(any(command[0] == "ln" for command in self.commands()))
        (available / "dbus/down").touch()
        self.log.unlink()
        result = self.bash(setup + "runit_services")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("disabled", result.stderr)
        self.assertEqual(self.commands(), [])

    def test_libvirt_readiness_retries_before_network_changes(self):
        path = self.path / "socket"
        count = self.path / "attempts"
        count.write_text("0")
        # Function calls happen inside conditions; record state outside subshells.
        script = f'''
LIBVIRT_SOCKET={shlex.quote(str(path))}
require_command() {{ :; }}
query_root() {{
    n=$(cat {shlex.quote(str(count))})
    echo "$((n+1))" > {shlex.quote(str(count))}
    ((n >= 2))
}}
sleep() {{ :; }}
wait_for_libvirt
'''
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(str(path))
            result = self.bash(script)
        self.assert_ok(result)
        self.assertEqual(count.read_text().strip(), "3")

    def test_runit_checks_down_marker_on_retained_custom_service(self):
        available = self.path / "sv"
        enabled = self.path / "enabled"
        custom = self.path / "custom-dbus"
        available.mkdir()
        enabled.mkdir()
        custom.mkdir()
        (custom / "down").touch()
        (enabled / "dbus").symlink_to(custom)
        result = self.bash(self.harness() + f"RUNIT_AVAILABLE={shlex.quote(str(available))}; RUNIT_ENABLED={shlex.quote(str(enabled))}; runit_services")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(enabled / "dbus/down"), result.stderr)
        self.assertEqual(self.commands(), [])

    def test_libvirt_readiness_timeout_fails_without_mutation(self):
        path = self.path / "socket"
        script = "LIBVIRT_SOCKET=" + shlex.quote(str(path)) + '''
require_command() { :; }
query_root() { echo daemon-unavailable >&2; return 1; }
sleep() { :; }
wait_for_libvirt
'''
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(str(path))
            result = self.bash(script)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("retry window", result.stderr)
        self.assertIn("daemon-unavailable", result.stderr)
        self.assertEqual(self.commands(), [])

    def test_production_host_check_only_reads_the_daemon(self):
        storage = self.path / "storage"
        (storage / "images").mkdir(parents=True)
        (storage / "vms").mkdir()
        path = self.path / "socket"
        script = f'''
LIBVIRT_SOCKET={shlex.quote(str(path))}
STORAGE_DIR={shlex.quote(str(storage))}
TUN_DEVICE=/dev/null
query_root() {{ {shlex.quote(str(self.shim))} "$@"; }}
require_command() {{ :; }}
docker() {{ return 0; }}
check_host
'''
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(str(path))
            result = self.bash(script)
        self.assert_ok(result)
        self.assertEqual([c[3] for c in self.commands()], ["list", "domcapabilities", "net-list"])

    def test_production_host_check_rejects_inactive_default_network(self):
        self.state.write_text(json.dumps({"defined": True, "active": False}))
        path = self.path / "socket"
        script = f'''
LIBVIRT_SOCKET={shlex.quote(str(path))}
TUN_DEVICE=/dev/null
query_root() {{ {shlex.quote(str(self.shim))} "$@"; }}
require_command() {{ :; }}
check_host
'''
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(str(path))
            result = self.bash(script)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("inactive", result.stderr)
        self.assertEqual([c[3] for c in self.commands()], ["list", "domcapabilities", "net-list"])

    def test_tun_failure_stops_before_network_changes(self):
        path = self.path / "missing-tun"
        result = self.bash(f'''
TUN_DEVICE={shlex.quote(str(path))}
require_command() {{ :; }}
run_root() {{ {shlex.quote(str(self.shim))} "$@"; }}
prepare_tun
''')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("TUN is unavailable", result.stderr)
        self.assertEqual(self.commands(), [["modprobe", "tun"]])

    def test_check_rejects_missing_tun_without_loading_modules(self):
        path = self.path / "socket"
        script = f'''
LIBVIRT_SOCKET={shlex.quote(str(path))}
TUN_DEVICE={shlex.quote(str(self.path / "missing-tun"))}
query_root() {{ {shlex.quote(str(self.shim))} "$@"; }}
require_command() {{ :; }}
check_host
'''
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(str(path))
            result = self.bash(script)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing TUN", result.stderr)
        self.assertEqual([c[3] for c in self.commands()], ["list", "domcapabilities"])

    def test_operator_selection_uses_sudo_user_and_rejects_uid_zero(self):
        result = self.bash('''
SUDO_USER=alice
id() { if [[ $1 == -u ]]; then echo 1000; fi; }
select_user
printf '%s' "$TARGET_USER"
''')
        self.assert_ok(result)
        self.assertEqual(result.stdout, "alice")
        result = self.bash('''
TARGET_USER=root-alias
id() { if [[ $1 == -u ]]; then echo 0; fi; }
select_user
''')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("non-root UID", result.stderr)

    def test_groups_preserve_memberships_and_skip_absent_kvm(self):
        result = self.bash(self.harness() + "TARGET_USER=operator; configure_groups")
        self.assert_ok(result)
        commands = self.commands()
        self.assertFalse(any("kvm" in command for command in commands))
        self.assertTrue(all("-aG" in c for c in commands if c[0] == "usermod"))
        self.assertFalse(any(c[0] == "newgrp" for c in commands))

    def test_check_mode_cannot_install_or_mutate(self):
        result = self.bash(self.harness() + "main --check")
        self.assert_ok(result)
        self.assertEqual(self.commands(), [["virsh", "--connect", "qemu:///system", "list", "--all"]])

    def test_default_network_xml(self):
        root = ET.parse(REPO / "setup/default-network.xml").getroot()
        self.assertEqual(root.findtext("name"), "default")
        self.assertEqual(root.find("forward").get("mode"), "nat")
        self.assertEqual(root.find("ip/dhcp/range").get("end"), "192.168.122.254")


if __name__ == "__main__":
    unittest.main()
