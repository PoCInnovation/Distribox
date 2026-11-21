import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PREPARE_SCRIPT = REPO_ROOT / "images" / "lib" / "prepare-qemu-ga-ssh.sh"
IMAGE_SCRIPTS_DIR = REPO_ROOT / "images" / "scripts"
DOCKERFILE = REPO_ROOT / "images" / "Dockerfile"
EXPECTED_PATH_LINE = (
    "export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)

GUEST_STUB = r'''
import os
from pathlib import Path
import sys

name = Path(sys.argv[0]).name
args = sys.argv[1:]
root = Path(os.environ['GUEST_ROOT'])
state = root / 'state'

if name == 'systemctl':
    with (state / 'services').open('a') as calls:
        calls.write(' '.join(args) + '\n')
elif name == 'semodule':
    if '-l' in args:
        print(*(path.stem for path in sorted(state.glob('*.cil'))), sep='\n')
    elif os.environ.get('POLICY_FAILS'):
        sys.exit(1)
    else:
        (state / Path(args[-1]).name).write_text(Path(args[-1]).read_text())
elif name == 'matchpathcon':
    print(os.environ['AGENT_LABEL'])
'''


class BuilderGuest:
    """Isolated guest root for running images/lib/prepare-qemu-ga-ssh.sh."""

    def __init__(self, root: Path):
        self.root = root
        self.binaries = root / "bin"
        for directory in (
            "bin",
            "state",
            "etc/sysconfig",
            "etc/selinux/targeted/contexts/files",
        ):
            (root / directory).mkdir(parents=True)
        for command in ("awk", "mktemp", "grep", "tail", "rm", "sed"):
            (self.binaries / command).symlink_to(shutil.which(command))
        self.add("qemu-ga", "sshd", "systemctl", "semodule")
        (root / "etc/selinux/config").write_text(
            "SELINUX=enforcing\nSELINUXTYPE=targeted\n"
        )
        (root / "etc/selinux/targeted/contexts/files/file_contexts").write_text(
            "/usr/bin/qemu-ga -- system_u:object_r:virt_qemu_ga_exec_t:s0\n"
        )

    def add(self, *commands):
        for command in commands:
            path = self.binaries / command
            path.write_text(f"#!{sys.executable}\n{GUEST_STUB}")
            path.chmod(0o755)

    def run(self, **environment):
        raw = PREPARE_SCRIPT.read_text()
        assert raw.count(EXPECTED_PATH_LINE) == 1, (
            "Expected PATH declaration changed; update BuilderGuest isolation"
        )
        assert "/etc/" in raw
        script = raw.replace(
            EXPECTED_PATH_LINE,
            f"export PATH={shlex.quote(str(self.binaries))}",
            1,
        ).replace("/etc/", f"{self.root}/etc/")
        return subprocess.run(
            ["/bin/sh", "-c", script],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, "GUEST_ROOT": str(self.root), **environment},
        )

    def state(self, name: str) -> str:
        path = self.root / "state" / name
        return path.read_text() if path.exists() else ""


@pytest.fixture
def guest(tmp_path):
    return BuilderGuest(tmp_path)


@pytest.mark.parametrize("before,after", [
    (
        'FILTER_RPC_ARGS="--allow-rpcs=guest-ping,guest-info"',
        'FILTER_RPC_ARGS="--allow-rpcs=guest-ping,guest-info,guest-exec,guest-exec-status"',
    ),
    (
        'FILTER_RPC_ARGS="--allow-rpcs=guest-exec-status,guest-ping"',
        'FILTER_RPC_ARGS="--allow-rpcs=guest-exec-status,guest-ping,guest-exec"',
    ),
    (
        "FILTER_RPC_ARGS='--allow-rpcs=guest-ping,guest-info'",
        "FILTER_RPC_ARGS='--allow-rpcs=guest-ping,guest-info,guest-exec,guest-exec-status'",
    ),
    (
        'FILTER_RPC_ARGS=--allow-rpcs="guest-ping,guest-info"',
        'FILTER_RPC_ARGS=--allow-rpcs="guest-ping,guest-info,guest-exec,guest-exec-status"',
    ),
    (
        'FILTER_RPC_ARGS="--allow-rpcs="',
        'FILTER_RPC_ARGS="--allow-rpcs="',
    ),
    (
        'FILTER_RPC_ARGS="--allow-rpcs=guest-ping --block-rpcs=guest-file-open,guest-exec"',
        'FILTER_RPC_ARGS="--allow-rpcs=guest-ping,guest-exec,guest-exec-status --block-rpcs=guest-file-open"',
    ),
    (
        'FILTER_RPC_ARGS="--block-rpcs=guest-exec --allow-rpcs=guest-ping"',
        'FILTER_RPC_ARGS="--block-rpcs= --allow-rpcs=guest-ping,guest-exec,guest-exec-status"',
    ),
    (
        'QEMU_GA_ARGS="--block-rpcs=guest-exec,guest-exec-foo --logfile=/var/log/guest-exec.log"',
        'QEMU_GA_ARGS="--block-rpcs=guest-exec-foo --logfile=/var/log/guest-exec.log"',
    ),
    (
        "QEMU_GA_ARGS=--block-rpcs=guest-file-open,guest-exec,guest-exec-status",
        "QEMU_GA_ARGS=--block-rpcs=guest-file-open",
    ),
    (
        'QEMU_GA_ARGS="--blacklist=guest-exec,guest-exec-status,guest-file-open"',
        'QEMU_GA_ARGS="--blacklist=guest-file-open"',
    ),
    (
        "BLACKLIST_RPC=guest-exec,guest-exec-status,guest-file-open",
        "BLACKLIST_RPC=guest-file-open",
    ),
    (
        'BLACKLIST_RPC="guest-exec,guest-exec-status,guest-file-open"',
        'BLACKLIST_RPC="guest-file-open"',
    ),
    (
        "BLACKLIST_RPC='guest-exec,guest-file-open'",
        "BLACKLIST_RPC='guest-file-open'",
    ),
    (
        "#QEMU_GA_ARGS=--block-rpcs=guest-file-open,guest-exec,guest-exec-status",
        "#QEMU_GA_ARGS=--block-rpcs=guest-file-open,guest-exec,guest-exec-status",
    ),
])
def test_prepare_updates_qemu_ga_rpc_filters_idempotently(guest, before, after):
    config = guest.root / "etc/sysconfig/qemu-ga"
    config.write_text(
        f"# comment\n{before}\nFSFREEZE_HOOK_PATHNAME=/etc/qemu-ga/fsfreeze-hook\n")

    first = guest.run()
    assert first.returncode == 0, first.stderr
    assert config.read_text() == (
        f"# comment\n{after}\nFSFREEZE_HOOK_PATHNAME=/etc/qemu-ga/fsfreeze-hook\n"
    )
    assert guest.state("services").splitlines() == [
        "enable qemu-guest-agent.service"]

    second = guest.run()
    assert second.returncode == 0, second.stderr
    assert config.read_text() == (
        f"# comment\n{after}\nFSFREEZE_HOOK_PATHNAME=/etc/qemu-ga/fsfreeze-hook\n"
    )


def test_prepare_succeeds_without_sysconfig_file(guest):
    result = guest.run()
    assert result.returncode == 0, result.stderr
    assert guest.state(
        "distribox-guest-agent.cil") == "(typepermissive virt_qemu_ga_t)\n"


def test_prepare_installs_permissive_selinux_module_for_qemu_ga(guest):
    result = guest.run()
    assert result.returncode == 0, result.stderr
    assert guest.state(
        "distribox-guest-agent.cil") == "(typepermissive virt_qemu_ga_t)\n"

    # Re-running does not reinstall when the module is already present.
    (guest.root / "state/distribox-guest-agent.cil").write_text("kept")
    again = guest.run()
    assert again.returncode == 0, again.stderr
    assert guest.state("distribox-guest-agent.cil") == "kept"


def test_prepare_fails_if_selinux_module_cannot_be_installed(guest):
    result = guest.run(POLICY_FAILS="1")
    assert result.returncode != 0


def test_prepare_skips_selinux_module_when_selinux_disabled(guest):
    (guest.root / "etc/selinux/config").write_text(
        "SELINUX=disabled\nSELINUXTYPE=targeted\n"
    )

    result = guest.run()
    assert result.returncode == 0, result.stderr
    assert guest.state("distribox-guest-agent.cil") == ""


def test_prepare_fallback_ignores_other_binaries_with_agent_label(guest):
    (guest.root / "etc/selinux/targeted/contexts/files/file_contexts").write_text(
        "/usr/bin/other-agent -- system_u:object_r:virt_qemu_ga_exec_t:s0\n"
    )

    result = guest.run()
    assert result.returncode == 0, result.stderr
    assert guest.state("distribox-guest-agent.cil") == ""


@pytest.mark.parametrize("label,relaxed", [
    ("system_u:object_r:virt_qemu_ga_exec_t:s0", True),
    ("system_u:object_r:bin_t:s0", False),
])
def test_prepare_checks_actual_qemu_ga_selinux_label(guest, label, relaxed):
    guest.add("matchpathcon")

    result = guest.run(AGENT_LABEL=label)
    assert result.returncode == 0, result.stderr
    assert bool(guest.state("distribox-guest-agent.cil")) is relaxed


@pytest.mark.parametrize("missing", ["qemu-ga", "sshd"])
def test_prepare_requires_agent_and_sshd(guest, missing):
    (guest.binaries / missing).unlink()

    result = guest.run()
    assert result.returncode != 0
    assert missing in result.stderr


def test_dockerfile_bundles_prepare_script():
    assert "lib/prepare-qemu-ga-ssh.sh" in DOCKERFILE.read_text()


@pytest.mark.parametrize("script_name", [
    "create-almalinux.sh",
    "create-centos.sh",
    "create-fedora.sh",
])
def test_rhel_family_builders_prepare_qemu_ga_before_relabel(script_name):
    content = (IMAGE_SCRIPTS_DIR / script_name).read_text()
    prepare_pos = content.index("prepare-qemu-ga-ssh.sh")
    relabel_pos = content.index("setfiles")
    assert prepare_pos < relabel_pos
