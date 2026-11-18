import os
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

from app.services import image_preparation
from app.services.image_preparation import GUEST_PREPARE, prepare_for_ssh


GUEST_STUB = r'''
import os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
args = sys.argv[1:]
binaries = Path(sys.argv[0]).parent
root = Path(os.environ['GUEST_ROOT'])
state = root / 'state'


def install(packages):
    (state / 'installed').write_text(' '.join(packages))
    for package in packages:
        command = binaries / ('qemu-ga' if package == 'qemu-guest-agent' else 'sshd')
        command.write_text('#!/bin/sh\n')
        command.chmod(0o755)
        if command.name == 'sshd':
            (root / 'etc/ssh/ssh_host_ed25519_key').write_text('made while installing')


if name == 'id':
    sys.exit(0 if os.environ.get('USER_ACCOUNT') else 1)
elif name in {'systemctl', 'rc-update'}:
    with (state / 'services').open('a') as calls:
        calls.write(' '.join(args) + '\n')
    if os.environ.get('MASKED_AGENT') and args[0] == 'enable':
        sys.exit(1)
elif name == 'semodule':
    if '-l' in args:
        print(*(path.stem for path in state.glob('*.cil')), sep='\n')
    elif os.environ.get('POLICY_FAILS'):
        sys.exit(1)
    else:
        (state / Path(args[-1]).name).write_text(Path(args[-1]).read_text())
elif name == 'matchpathcon':
    print(os.environ['AGENT_LABEL'])
elif name == 'setfiles':
    (state / 'relabelled').write_text(' '.join(args[args.index('/run') + 2:]))
elif name == 'apt-get' and 'install' in args:
    if os.environ.get('INSTALL_FAILS'):
        print('Reading package lists...')
        print('E: Unable to locate package qemu-guest-agent')
        sys.exit(100)
    install(args[args.index('install') + 1:])
    if os.environ.get('CONFIGURE_FAILS'):
        print('E: Sub-process /usr/bin/dpkg returned an error code (1)')
        sys.exit(100)
elif name == 'pacman':
    if '--config' not in args:
        print('error: failed retrieving file from mirror: 404')
        sys.exit(1)
    (state / 'pacman.conf').write_text(Path(args[args.index('--config') + 1]).read_text())
    install(args[args.index('--needed') + 1:])
'''


class Guest:
    """An isolated guest filesystem and package manager for the real script."""

    def __init__(self, root: Path):
        self.root = root
        self.binaries = root / 'bin'
        for directory in ('bin', 'state', 'etc/ssh', 'etc/sysconfig', 'var/lib/dpkg'):
            (root / directory).mkdir(parents=True)
        (root / 'var/lib/dpkg/status').touch()
        (root / 'etc/passwd').write_text(
            'root:x:0:0::/root:/bin/sh\nstudent:x:1000:1000::/home/student:/bin/bash\n')
        for command in ('mktemp', 'grep', 'tail', 'rm', 'sed', 'awk', 'sort', 'head', 'cut', 'touch', 'cat'):
            (self.binaries / command).symlink_to(shutil.which(command))
        self.add('id', 'systemctl', 'apt-get')

    def add(self, *commands):
        for command in commands:
            path = self.binaries / command
            path.write_text(f'#!{sys.executable}\n{GUEST_STUB}')
            path.chmod(0o755)

    def run(self, **environment):
        script = GUEST_PREPARE.replace(
            'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            f'export PATH={self.binaries}',
        ).replace('/etc/', f'{self.root}/etc/').replace(
            '/var/lib/dpkg/status', f'{self.root}/var/lib/dpkg/status')
        return subprocess.run(
            ['/bin/sh', '-c', script], capture_output=True, text=True, timeout=10,
            env={**os.environ, 'GUEST_ROOT': str(self.root), **environment})

    def state(self, name):
        path = self.root / 'state' / name
        return path.read_text() if path.exists() else ''

    def host_keys(self):
        return [path.name for path in (self.root / 'etc/ssh').iterdir()]


@pytest.fixture
def guest(tmp_path):
    return Guest(tmp_path)


def test_missing_agent_and_ssh_server_are_installed_with_the_server_left_off(guest):
    result = guest.run()

    assert result.returncode == 0, result.stderr
    assert result.stdout == ''
    assert guest.state('installed') == 'qemu-guest-agent openssh-server'
    assert guest.state('services').splitlines() == [
        'enable qemu-guest-agent.service', 'disable ssh.service',
        'disable ssh.socket', 'disable sshd.service', 'disable sshd.socket']
    # Every VM must create its own host keys.
    assert guest.host_keys() == []


def test_an_ssh_server_the_image_came_with_is_left_as_it_is(guest):
    guest.add('sshd')
    (guest.root / 'etc/ssh/ssh_host_ed25519_key').write_text('from the image')

    result = guest.run()

    assert result.returncode == 0, result.stderr
    assert guest.state('installed') == 'qemu-guest-agent'
    assert guest.state('services') == 'enable qemu-guest-agent.service\n'
    assert guest.host_keys() == ['ssh_host_ed25519_key']


def test_a_complete_image_installs_nothing(guest):
    guest.add('sshd', 'qemu-ga')
    (guest.binaries / 'apt-get').unlink()

    result = guest.run()

    assert result.returncode == 0, result.stderr
    assert guest.state('installed') == ''


def test_failed_install_gives_the_package_manager_reason(guest):
    result = guest.run(INSTALL_FAILS='1')

    assert result.returncode == 1
    assert result.stderr.splitlines()[0] == (
        'apt-get could not install qemu-guest-agent openssh-server: '
        'E: Unable to locate package qemu-guest-agent')


def test_install_that_ends_in_an_error_is_not_trusted(guest):
    # The programs are unpacked, but a package failed to configure.
    result = guest.run(CONFIGURE_FAILS='1')

    assert result.returncode == 1
    assert result.stderr.splitlines()[0] == (
        'apt-get could not install qemu-guest-agent openssh-server: '
        'E: Sub-process /usr/bin/dpkg returned an error code (1)')


def test_agent_that_cannot_start_at_boot_is_reported(guest):
    result = guest.run(MASKED_AGENT='1')

    assert result.returncode == 1
    assert result.stderr.splitlines()[0] == 'The guest agent could not be enabled'


def test_arch_installs_old_versions_from_the_archive_without_refreshing(guest):
    (guest.binaries / 'apt-get').unlink()
    guest.add('pacman')
    (guest.root / 'etc/pacman.conf').write_text(
        f'[core]\nInclude = {guest.root}/etc/pacman.d/mirrorlist\n'
        '[custom]\nServer = https://example.com/$repo\n')

    result = guest.run()

    assert result.returncode == 0, result.stderr
    assert guest.state('installed') == 'qemu-guest-agent openssh'
    assert guest.state('pacman.conf') == (
        '[core]\nServer = https://archive.archlinux.org/packages/.all\n'
        '[custom]\nServer = https://example.com/$repo\n')


@pytest.mark.parametrize('before,after', [
    ('FILTER_RPC_ARGS="--allow-rpcs=guest-ping,guest-info"',
     'FILTER_RPC_ARGS="--allow-rpcs=guest-ping,guest-info,guest-exec,guest-exec-status"'),
    ('FILTER_RPC_ARGS="--allow-rpcs=guest-exec-status,guest-ping"',
     'FILTER_RPC_ARGS="--allow-rpcs=guest-exec-status,guest-ping,guest-exec"'),
    ('QEMU_GA_ARGS=--block-rpcs=guest-file-open,guest-exec,guest-exec-status',
     'QEMU_GA_ARGS=--block-rpcs=guest-file-open'),
    ('BLACKLIST_RPC=guest-exec,guest-exec-status,guest-file-open',
     'BLACKLIST_RPC=guest-file-open'),
    ('# FILTER_RPC_ARGS="--block-rpcs=guest-exec,guest-exec-status"',
     '# FILTER_RPC_ARGS="--block-rpcs=guest-exec,guest-exec-status"'),
])
def test_agent_is_allowed_to_run_the_ssh_setup(guest, before, after):
    guest.add('sshd', 'qemu-ga')
    config = guest.root / 'etc/sysconfig/qemu-ga'
    config.write_text(f'# comment\n{before}\nFSFREEZE_HOOK_PATHNAME=/dev/null\n')

    assert guest.run().returncode == 0
    assert config.read_text() == f'# comment\n{after}\nFSFREEZE_HOOK_PATHNAME=/dev/null\n'
    assert guest.run().returncode == 0
    assert config.read_text() == f'# comment\n{after}\nFSFREEZE_HOOK_PATHNAME=/dev/null\n'


def selinux(guest, contexts='/usr/bin/qemu-ga -- system_u:object_r:virt_qemu_ga_exec_t:s0\n',
            config='SELINUX=enforcing\nSELINUXTYPE=targeted\n'):
    guest.add('semodule', 'setfiles')
    directory = guest.root / 'etc/selinux/targeted/contexts/files'
    directory.mkdir(parents=True)
    (directory / 'file_contexts').write_text(contexts)
    (guest.root / 'etc/selinux/config').write_text(config)


def test_selinux_guest_lets_the_agent_set_up_ssh_and_gets_relabelled(guest):
    selinux(guest)

    assert guest.run().returncode == 0
    assert guest.state('distribox-guest-agent.cil') == '(typepermissive virt_qemu_ga_t)\n'
    assert guest.state('relabelled') == '/'

    # Nothing is installed the second time, so only what was written is relabelled.
    (guest.root / 'state/distribox-guest-agent.cil').write_text('kept')
    assert guest.run().returncode == 0
    assert guest.state('distribox-guest-agent.cil') == 'kept'
    assert guest.state('relabelled') == (
        f'{guest.root}/etc/systemd/system {guest.root}/etc/selinux /var/lib/selinux')


def test_selinux_policy_that_cannot_be_changed_is_reported(guest):
    selinux(guest)

    result = guest.run(POLICY_FAILS='1')

    assert result.returncode == 1
    assert result.stderr.splitlines()[0] == (
        'SELinux could not be told to let the guest agent set up SSH')


@pytest.mark.parametrize('settings,relabelled', [
    # A policy that does not confine the agent is left alone.
    ({'contexts': '/usr/sbin/sshd -- system_u:object_r:sshd_exec_t:s0\n'}, '/'),
    ({'config': 'SELINUX=disabled\nSELINUXTYPE=targeted\n'}, ''),
])
def test_selinux_is_only_relaxed_where_it_confines_the_agent(guest, settings, relabelled):
    selinux(guest, **settings)

    assert guest.run().returncode == 0
    assert guest.state('distribox-guest-agent.cil') == ''
    assert guest.state('relabelled') == relabelled


@pytest.mark.parametrize('label,relaxed', [
    ('system_u:object_r:virt_qemu_ga_exec_t:s0', True),
    # A local rule moved the agent out of the confined domain.
    ('system_u:object_r:bin_t:s0', False),
])
def test_selinux_goes_by_the_label_the_agent_really_gets(guest, label, relaxed):
    selinux(guest)
    guest.add('matchpathcon')

    assert guest.run(AGENT_LABEL=label).returncode == 0
    assert bool(guest.state('distribox-guest-agent.cil')) is relaxed


def test_an_image_without_an_account_is_reported(guest):
    guest.add('sshd', 'qemu-ga')
    (guest.root / 'etc/passwd').write_text('root:x:0:0::/root:/bin/sh\n')

    assert guest.run().stdout == 'no-account\n'
    assert guest.run(USER_ACCOUNT='1').stdout == ''
    guest.add('cloud-init')
    assert guest.run().stdout == ''


def test_unsupported_init_system_is_reported(guest):
    (guest.binaries / 'systemctl').unlink()

    result = guest.run()

    assert result.returncode == 1
    assert result.stderr.splitlines()[0] == 'It uses neither systemd nor OpenRC'
    assert guest.state('installed') == ''


HOST_STUB = r'''
import os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
with open(os.environ['HOST_CALLS'], 'a') as calls:
    calls.write(' '.join([name, *(arg for arg in sys.argv[1:] if len(arg) < 200)]) + '\n')
if name == 'qemu-img':
    action = sys.argv[1]
    if action == 'info':
        print(os.environ.get('IMAGE_INFO', '{"format": "qcow2"}'))
    elif action == 'create':
        Path(sys.argv[-1]).write_text('overlay')
    elif os.environ.get('SAVE_FAILS'):
        sys.exit(1)
    elif action == 'convert':
        Path(sys.argv[-1]).write_text('prepared disk')
    sys.exit(0)
sys.stdout.write(os.environ.get('GUESTFISH_OUT', 'true\n'))
sys.stderr.write(os.environ.get('GUESTFISH_ERR', ''))
sys.exit(int(os.environ.get('GUESTFISH_EXIT', 0)))
'''


@pytest.fixture
def host(tmp_path, monkeypatch):
    # Stand-ins for guestfish and qemu-img: no disk is read and nothing boots.
    binaries = tmp_path / 'bin'
    binaries.mkdir()
    for command in ('guestfish', 'qemu-img'):
        (binaries / command).write_text(f'#!{sys.executable}\n{HOST_STUB}')
        (binaries / command).chmod(0o755)
    calls = tmp_path / 'calls'
    calls.touch()
    monkeypatch.setenv('PATH', f"{binaries}:{os.environ['PATH']}")
    monkeypatch.setenv('HOST_CALLS', str(calls))
    monkeypatch.setattr(image_preparation, '_expose_kvm', lambda: None)
    image = tmp_path / 'course-vm.qcow2'
    image.write_text('disk')
    image.chmod(0o640)

    def commands():
        return [line.split()[:2] for line in calls.read_text().splitlines()]

    return image, commands


def disks(image):
    return {path.name: path.read_text() for path in image.parent.glob('*.qcow2*')}


def test_prepared_upload_is_saved_into_the_image(host):
    image, commands = host

    assert prepare_for_ssh(image) is None
    assert commands() == [['qemu-img', 'info'], ['qemu-img', 'create'],
                          ['guestfish', '--rw'], ['qemu-img', 'commit']]
    assert disks(image) == {image.name: 'disk'}


def test_image_in_use_is_replaced_in_one_step(host):
    image, commands = host

    assert prepare_for_ssh(image, replace=True) is None
    assert commands()[-1] == ['qemu-img', 'convert']
    assert ['qemu-img', 'commit'] not in commands()
    assert disks(image) == {image.name: 'prepared disk'}
    assert image.stat().st_mode & 0o777 == 0o640


@pytest.mark.parametrize('replace', [False, True])
def test_image_that_cannot_be_saved_is_an_error(host, monkeypatch, replace):
    image, commands = host
    monkeypatch.setenv('SAVE_FAILS', '1')

    with pytest.raises(RuntimeError):
        prepare_for_ssh(image, replace=replace)
    assert disks(image) == {image.name: 'disk'}


@pytest.mark.parametrize('environment,reason', [
    ({'GUESTFISH_OUT': 'false\n', 'GUESTFISH_EXIT': '1'},
     'No Linux system was found on the disk'),
    ({'GUESTFISH_OUT': '', 'GUESTFISH_EXIT': '1',
      'GUESTFISH_ERR': 'guestfish: no operating system was found on this disk\n'},
     'No operating system was found on the disk'),
    ({'GUESTFISH_EXIT': '1',
      'GUESTFISH_ERR': 'libguestfs: error: sh: dnf could not install openssh-server: '
                       'Error: Failed to download metadata\nlast lines of the log\n'},
     'dnf could not install openssh-server: Error: Failed to download metadata'),
    ({'GUESTFISH_EXIT': '1', 'GUESTFISH_ERR': 'libguestfs: error: something else\n'},
     'The disk could not be opened'),
])
@pytest.mark.parametrize('replace', [False, True])
def test_unprepared_image_is_left_untouched_with_the_reason(host, monkeypatch, environment, reason, replace):
    image, commands = host
    for name, value in environment.items():
        monkeypatch.setenv(name, value)

    assert prepare_for_ssh(image, replace=replace) == reason
    assert commands()[-1] == ['guestfish', '--rw']
    assert disks(image) == {image.name: 'disk'}


@pytest.mark.parametrize('info', [
    '{"format": "qcow2", "backing-filename": "/var/lib/distribox/images/other.qcow2"}',
    '{"format": "qcow2", "format-specific": {"type": "qcow2", "data": {"data-file": "/etc/passwd"}}}',
])
def test_image_reaching_other_host_files_is_never_opened(host, monkeypatch, info):
    image, commands = host
    monkeypatch.setenv('IMAGE_INFO', info)

    assert prepare_for_ssh(image) == 'The disk depends on another file'
    assert commands() == [['qemu-img', 'info']]


def test_image_in_use_with_snapshots_is_not_replaced(host, monkeypatch):
    image, commands = host
    monkeypatch.setenv('IMAGE_INFO', '{"format": "qcow2", "snapshots": [{"id": "1", "name": "clean"}]}')

    # A new file would lose the snapshots; merging into the image keeps them.
    assert prepare_for_ssh(image, replace=True) == 'The disk has snapshots'
    assert commands() == [['qemu-img', 'info']]
    assert prepare_for_ssh(image) is None


def test_replacement_that_cannot_keep_the_owner_is_an_error(host, monkeypatch):
    image, commands = host
    owner = image.stat()
    monkeypatch.setattr(image_preparation.os, 'chown', Mock(side_effect=PermissionError('not permitted')))
    real_stat = Path.stat

    def stat_as_another_owner(path, **kwargs):
        result = real_stat(path, **kwargs)
        if path.name.endswith('.prepared'):
            return os.stat_result((*result[:4], owner.st_uid + 1, *result[5:]))
        return result

    monkeypatch.setattr(Path, 'stat', stat_as_another_owner)

    with pytest.raises(RuntimeError):
        prepare_for_ssh(image, replace=True)
    assert disks(image) == {image.name: 'disk'}


def test_image_without_an_account_keeps_what_was_installed(host, monkeypatch):
    image, commands = host
    monkeypatch.setenv('GUESTFISH_OUT', 'true\nno-account\n')

    assert prepare_for_ssh(image) == 'It has no user account to sign in to'
    assert ['qemu-img', 'commit'] in commands()


def test_host_without_libguestfs_says_so(host, monkeypatch):
    image, commands = host
    monkeypatch.setattr(image_preparation.shutil, 'which', lambda name: None)

    assert prepare_for_ssh(image) == 'libguestfs is not installed on this host'
    assert commands() == []
