import os
import shutil
import subprocess
import sys

import pytest

from app.services.ssh_guest import GUEST_SETUP


STUB = r'''
import os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
args = sys.argv[1:]
state = Path(os.environ['SERVICE_STATE'])
if name == 'id':
    if os.environ.get('MISSING_USER'):
        sys.exit(1)
    if args[0] == '-u': print(os.getuid())
    if args[0] == '-g': print(os.getgid())
elif name == 'sshd':
    sys.exit(1 if os.environ.get('INVALID_CONFIG') else 0)
elif name == 'systemctl':
    if args[1] != os.environ['SYSTEMD_UNIT'] or os.environ.get('SERVICE_FAILURE'):
        sys.exit(1)
    if args[0] == 'enable':
        (state / 'enabled').write_text(args[1])
    elif args[0] == 'reload-or-restart':
        (state / 'running').write_text('new-configuration')
elif name == 'rc-update':
    (state / 'enabled').write_text('default')
elif name == 'rc-service':
    if os.environ.get('SERVICE_FAILURE'):
        sys.exit(1)
    if args[1] == 'reload' and os.environ.get('RELOAD_FAILURE'):
        sys.exit(1)
    if args[1] in {'reload', 'restart'}:
        (state / 'running').write_text('new-configuration')
'''


@pytest.fixture
def guest_script(tmp_path):
    # Exercise the actual setup script against an isolated guest filesystem and
    # service-manager commands; no host SSH configuration or services are touched.
    binaries = tmp_path / 'bin'
    binaries.mkdir()
    etc = tmp_path / 'etc'
    etc.mkdir()
    ssh = etc / 'ssh'
    ssh.mkdir()
    (ssh / 'sshd_config').write_text('Port 22\n')
    (ssh / 'ssh_host_ed25519_key.pub').write_text('guest-host-key\n')
    home = tmp_path / 'home'
    home.mkdir()
    (etc / 'passwd').write_text(
        f'user:x:{os.getuid()}:{os.getgid()}::{home}:/bin/sh\n')
    state = tmp_path / 'state'
    state.mkdir()
    for command in ('awk', 'mkdir', 'touch', 'grep', 'chmod', 'chown', 'head', 'mktemp', 'mv', 'rm', 'cat'):
        (binaries / command).symlink_to(shutil.which(command))
    for command in ('id', 'sshd', 'ssh-keygen'):
        path = binaries / command
        path.write_text(f'#!{sys.executable}\n{STUB}')
        path.chmod(0o755)

    def run(manager, **environment):
        for command in {'systemctl'} if manager.startswith('systemd') else (
                {'rc-service', 'rc-update'} if manager == 'openrc' else set()):
            path = binaries / command
            path.write_text(f'#!{sys.executable}\n{STUB}')
            path.chmod(0o755)
        script = GUEST_SETUP.replace(
            'export PATH=/usr/sbin:/usr/bin:/sbin:/bin', f'export PATH={binaries}')
        script = script.replace('/etc/ssh', str(ssh)).replace(
            '/etc/passwd', str(etc / 'passwd')).replace('/run/sshd', str(tmp_path / 'run' / 'sshd'))
        env = {
            **os.environ, 'SERVICE_STATE': str(state),
            'SYSTEMD_UNIT': 'sshd.service' if manager == 'systemd-sshd' else 'ssh.service',
            **environment,
        }
        return subprocess.run(['/bin/sh', '-c', script, 'distribox-ssh', 'test-public-key'],
                              env=env, capture_output=True, text=True, timeout=5)

    return run, state, home


@pytest.mark.parametrize('manager', ['systemd-ssh', 'systemd-sshd', 'openrc'])
@pytest.mark.parametrize('already_running', [False, True])
def test_setup_enables_service_and_applies_configuration(guest_script, manager, already_running):
    run, state, home = guest_script
    if already_running:
        (state / 'running').write_text('old-configuration')

    result = run(manager, RELOAD_FAILURE='1' if already_running else '')

    assert result.returncode == 0, result.stderr
    assert (state / 'enabled').exists()
    assert (state / 'running').read_text() == 'new-configuration'
    assert (home / '.ssh' / 'authorized_keys').read_text().strip() == 'test-public-key'
    assert result.stdout == 'guest-host-key\n'


@pytest.mark.parametrize('environment,exitcode', [
    ({'MISSING_USER': '1'}, 11),
    ({'INVALID_CONFIG': '1'}, 14),
    ({'SERVICE_FAILURE': '1'}, 13),
])
def test_setup_reports_service_failures(guest_script, environment, exitcode):
    run, state, home = guest_script

    result = run('systemd-ssh', **environment)

    assert result.returncode == exitcode
    assert not (state / 'enabled').exists()
    assert not (state / 'running').exists()


def test_setup_reports_missing_openssh(guest_script):
    run, state, home = guest_script
    (state.parent / 'bin' / 'sshd').unlink()

    assert run('systemd-ssh').returncode == 10


def test_setup_reports_unsupported_init_system(guest_script):
    run, state, home = guest_script

    assert run('none').returncode == 12
