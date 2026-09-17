"""Exercise real mount propagation in a private, unprivileged Linux namespace."""
from pathlib import Path
import shutil
import subprocess
import sys
import textwrap
import unittest


BROKER = Path(__file__).resolve().parents[1] / "storage_broker.py"


@unittest.skipUnless(sys.platform == "linux" and shutil.which("unshare"), "Linux user namespaces required")
class MountIntegrationTest(unittest.TestCase):
    def test_live_alias_propagation_restart_and_missing_partition(self):
        probe = subprocess.run(["unshare", "-Urnm", "true"], capture_output=True, timeout=10)
        if probe.returncode:
            self.skipTest("Unprivileged user/mount namespaces are disabled")
        # All mounts belong to this subprocess's mount namespace and disappear
        # when it exits. No host services, disks, or Docker containers change.
        program = textwrap.dedent(r'''
            import importlib.util
            import json
            import http.client
            import os
            from pathlib import Path
            import subprocess
            import sys
            import tempfile
            import socket
            import threading

            spec = importlib.util.spec_from_file_location("broker", sys.argv[1])
            broker = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(broker)
            work = Path(tempfile.mkdtemp(prefix="distribox-mount-test-"))
            broker.BASE = work / "state"
            broker.CONFIG = broker.BASE / "storage.json"
            broker.ALIASES = broker.BASE / "storage"
            broker.SOCKET = broker.BASE / "run" / "storage.sock"
            # In a user namespace the real root-owned / and /tmp ancestors have
            # an unmapped UID. Test directories below work still use real checks.
            original_owner_check = broker._root_owned
            broker._root_owned = lambda path, info: (
                None if path in {Path("/"), Path("/tmp")} else original_owner_check(path, info))
            broker.SYSTEM_ROOTS = broker.SYSTEM_ROOTS - {"tmp"}
            broker.FILESYSTEMS = broker.FILESYSTEMS | {"tmpfs"}
            source = work / "data"
            source.mkdir()
            subprocess.run(["mount", "-t", "tmpfs", "-o", "size=16m,mode=755", "none", str(source)], check=True)
            broker.prepare()
            count = lambda: sum(item["mount_path"] == str(broker.BASE) for item in broker.read_mounts())
            assert count() == 1
            broker.prepare()
            assert count() == 1, "Restart stacked another bind mount"
            server = broker.UnixHTTPServer(str(broker.SOCKET), broker.Handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()

            def request(method, path, payload=None):
                connection = http.client.HTTPConnection('localhost')
                connection.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                connection.sock.settimeout(10)
                connection.sock.connect(str(broker.SOCKET))
                connection.request(method, path, json.dumps(payload) if payload is not None else None,
                                   {'Content-Type': 'application/json'})
                response = connection.getresponse()
                data = json.loads(response.read())
                assert response.status == 200, data
                connection.close()
                return data

            mirror = work / "container-storage"
            mirror.mkdir()
            # Simulate Docker's rslave bind in a separate mount namespace before
            # adding storage. The newly enabled mount must appear without restart.
            child_code = r"""
            import json, subprocess, sys, time
            from pathlib import Path
            base, mirror = map(Path, sys.argv[1:])
            subprocess.run(['mount', '--bind', str(base), str(mirror)], check=True)
            subprocess.run(['mount', '--make-rslave', str(mirror)], check=True)
            print('ready', flush=True)
            for attempt in range(100):
                files = list((mirror / 'storage').glob('*/images/round-trip'))
                if files:
                    assert files[0].read_text() == 'partition contents'
                    print('propagated', flush=True)
                    sys.exit(0)
                time.sleep(0.05)
            raise RuntimeError('New storage did not propagate to the running container mount')
            """
            child = subprocess.Popen(['unshare', '--mount', '--propagation', 'slave',
                                      sys.executable, '-c', child_code, str(broker.BASE), str(mirror)],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            assert child.stdout.readline().strip() == 'ready'
            candidates = request('GET', '/mounts')['candidates']
            candidate = next(item for item in candidates if item['mount_path'] == str(source))
            assert candidate['available'], candidate
            pool = request('POST', '/locations', {'mount_id': candidate['id'], 'name': 'Data'})
            alias = Path(pool['path'])
            assert os.path.samefile(alias, source / 'distribox')
            (alias / 'images' / 'round-trip').write_text('partition contents')
            output, error = child.communicate(timeout=10)
            assert child.returncode == 0, error
            assert output.strip() == 'propagated'
            request('PATCH', '/locations/' + pool['id'], {'enabled': False, 'name': 'Renamed'})
            assert (alias / 'images' / 'round-trip').read_text() == 'partition contents'
            subprocess.run(['umount', str(alias)], check=True)
            broker.restore()
            assert os.path.samefile(alias, source / 'distribox')
            assert json.loads(broker.CONFIG.read_text())['pools'][0]['enabled'] is False
            subprocess.run(['umount', str(alias)], check=True)
            subprocess.run(['umount', str(source)], check=True)
            broker.restore()
            assert not (source / 'distribox').exists(), 'Recreated storage on the system disk'
            assert not (alias / broker.MARKER).exists()
            server.shutdown()
            server.server_close()
            subprocess.run(['umount', str(broker.BASE)], check=True)
            import shutil
            shutil.rmtree(work)
            print('Live propagation, restart, disable and missing partition verified')
        ''')
        result = subprocess.run(
            ["unshare", "-Urnm", sys.executable, "-c", program, str(BROKER)],
            capture_output=True, text=True, timeout=40,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Live propagation", result.stdout)


if __name__ == "__main__":
    unittest.main()
