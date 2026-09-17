"""Host service regressions; all mount operations are mocked."""

import importlib.util
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import stat
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("storage_broker", Path(__file__).parents[1] / "storage_broker.py")
broker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)


class StorageBrokerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.base = self.root / "base"
        self.base.mkdir()
        self.partition = self.root / "data"
        self.partition.mkdir()
        device = self.partition.stat().st_dev
        self.mount = {"mount_path": str(self.partition), "device": f"{os.major(device)}:{os.minor(device)}",
                      "root": "/", "filesystem": "ext4", "source": "/dev/test-storage", "options": ["rw"], "shared": False}
        self.mounts = [{**self.mount, "mount_path": "/", "device": "9:999"}, self.mount]
        self.aliases = {}
        self.commands = []
        for name, value in {"BASE": self.base, "CONFIG": self.base / "storage.json",
                            "ALIASES": self.base / "storage", "SOCKET": self.base / "run" / "storage.sock",
                            "SYSTEM_ROOTS": set()}.items():
            mock = patch.object(broker, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        # Tests may run as an ordinary account and use /tmp; production never
        # bypasses this ownership check. Link and shape checks remain exercised.
        for mock in (patch.object(broker, "_root_owned"),
                     patch.object(broker, "read_mounts", side_effect=lambda: list(self.mounts)),
                     patch.object(broker, "mount_command", side_effect=self.fake_mount),
                     patch.object(Path, "is_mount", autospec=True, side_effect=lambda path: any(m["mount_path"] == str(path) for m in self.mounts))):
            mock.start()
            self.addCleanup(mock.stop)
        actual_samefile = broker.same_directory
        mock = patch.object(broker, "same_directory", side_effect=lambda a, b:
                            self.aliases.get(str(b)) == os.readlink(f"/proc/self/fd/{a}") or actual_samefile(a, b))
        mock.start()
        self.addCleanup(mock.stop)
        broker.prepare()

    def fake_mount(self, *arguments, **kwargs):
        self.commands.append(arguments)
        if "--bind" in arguments:
            source, target = arguments[-2:]
            if source.startswith("/proc/self/fd/"):
                source = os.readlink(source)
            self.mounts.append({**self.mount, "mount_path": target})
            self.aliases[target] = source
            if source != target:
                shutil.copytree(source, target, dirs_exist_ok=True)

    def enable(self):
        return broker.create_location({"mount_id": broker.candidate_id(self.mount), "name": "Data drive"})

    def test_discover_capacity_and_configured_identity(self):
        entry = broker.discover()["candidates"][0]
        self.assertTrue(entry["available"])
        self.assertGreater(entry["available_gib"], 0)
        self.assertIsNone(entry["configured_storage_id"])
        pool = self.enable()
        candidates = broker.discover()["candidates"]
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["configured_storage_id"], pool["id"])

    def test_prepare_does_not_stack_bind_mounts(self):
        broker.prepare()
        bindings = [args for args in self.commands if args == ("--bind", str(self.base), str(self.base))]
        self.assertEqual(len(bindings), 1)

    def test_enabling_creates_dedicated_directories_and_config(self):
        pool = self.enable()
        self.assertTrue(pool["managed"])
        self.assertTrue(pool["enabled"])
        self.assertEqual(Path(pool["path"]).parent, broker.ALIASES)
        self.assertEqual(pool["source_path"], str(self.partition / "distribox"))
        self.assertEqual(broker.read_config()["pools"], [pool])
        self.assertEqual((Path(pool["source_path"]) / broker.MARKER).read_text().strip(), pool["marker"])
        self.assertTrue((Path(pool["source_path"]) / "images").is_dir())
        self.assertTrue((Path(pool["source_path"]) / "vms").is_dir())
        self.assertEqual(set(path.name for path in self.partition.iterdir()), {"distribox"})

    def test_permissions_allow_host_libvirt_traversal_even_with_private_umask(self):
        previous = os.umask(0o077)
        try:
            pool = self.enable()
        finally:
            os.umask(previous)
        self.assertEqual(stat.S_IMODE(Path(pool["source_path"]).stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE((Path(pool["source_path"]) / "vms").stat().st_mode), 0o755)

    def test_enable_is_idempotent(self):
        first = self.enable()
        bindings = len(self.commands)
        second = self.enable()
        self.assertEqual(first, second)
        self.assertEqual(len(self.commands), bindings)
        self.assertEqual(len(broker.read_config()["pools"]), 1)

    def test_rejects_arbitrary_paths_extra_fields_and_stale_mount_id(self):
        for payload in ({"mount_id": "/data"}, {"mount_id": "mount-expired"},
                        {"mount_id": broker.candidate_id(self.mount), "path": "/etc"},
                        {"mount_id": True}, [], None):
            with self.subTest(payload=payload), self.assertRaises(broker.StorageError):
                broker.create_location(payload)
        self.assertFalse((self.partition / "distribox").exists())

    def test_rejects_readonly_and_changed_mount(self):
        self.mount["options"] = ["ro"]
        self.assertFalse(broker.discover()["candidates"][0]["available"])
        with self.assertRaisesRegex(broker.StorageError, "read-only"):
            self.enable()
        self.mount["options"] = ["rw"]
        self.mount["device"] = "8:999"
        with self.assertRaisesRegex(broker.StorageError, "partition changed"):
            self.enable()

    def test_partition_disappearing_before_open_cannot_write_to_system_disk(self):
        actual_open, actual_fstat = os.open, os.fstat
        opened = set()

        def open_path(path, *args, **kwargs):
            descriptor = actual_open(path, *args, **kwargs)
            if path == self.partition:
                opened.add(descriptor)
            return descriptor

        def fstat(descriptor):
            if descriptor in opened:
                return SimpleNamespace(st_dev=os.makedev(8, 999))
            return actual_fstat(descriptor)

        with patch.object(broker.os, "open", side_effect=open_path), patch.object(broker.os, "fstat", side_effect=fstat):
            with self.assertRaisesRegex(broker.StorageError, "partition changed"):
                self.enable()
        self.assertEqual(list(self.partition.iterdir()), [])
        self.assertFalse(broker.CONFIG.exists())

    def test_unmount_after_open_keeps_writes_and_cleanup_on_original_filesystem(self):
        original_mkdir = os.mkdir
        detached = self.root / "detached-data"

        def mkdir(path, *args, **kwargs):
            if path == "images" and "dir_fd" in kwargs:
                self.partition.rename(detached)
                self.partition.mkdir()
                self.mounts.remove(self.mount)
            return original_mkdir(path, *args, **kwargs)

        with patch.object(broker.os, "mkdir", side_effect=mkdir):
            with self.assertRaisesRegex(broker.StorageError, "no longer mounted"):
                self.enable()
        self.assertEqual(list(self.partition.iterdir()), [])
        self.assertEqual(list(detached.iterdir()), [])
        self.assertFalse(broker.CONFIG.exists())

    def test_unexpected_existing_contents_are_preserved(self):
        source = self.partition / "distribox"
        source.mkdir()
        (source / "keep-me").write_text("existing data")
        with self.assertRaisesRegex(broker.StorageError, "already contains"):
            self.enable()
        self.assertEqual((source / "keep-me").read_text(), "existing data")
        self.assertFalse(broker.CONFIG.exists())

    def test_symlink_source_and_config_are_rejected(self):
        source = self.partition / "distribox"
        source.symlink_to(self.base, target_is_directory=True)
        with self.assertRaisesRegex(broker.StorageError, "symbolic"):
            self.enable()
        source.unlink()
        broker.CONFIG.symlink_to(self.root / "elsewhere")
        with self.assertRaisesRegex(broker.StorageError, "symbolic"):
            self.enable()

    def test_disabling_preserves_data_and_mount(self):
        pool = self.enable()
        disk = Path(pool["source_path"]) / "vms" / "keep.qcow2"
        disk.write_text("vm disk")
        commands = list(self.commands)
        updated = broker.update_location(pool["id"], {"enabled": False, "name": "Archive"})
        self.assertFalse(updated["enabled"])
        self.assertEqual(updated["name"], "Archive")
        self.assertEqual(disk.read_text(), "vm disk")
        self.assertEqual(commands, self.commands)

    def test_update_accepts_only_name_and_boolean_enabled(self):
        pool = self.enable()
        for payload in ({"path": "/etc"}, {"enabled": 1}, {"enabled": "false"}, {"name": " "}, {}, None):
            with self.subTest(payload=payload), self.assertRaises(broker.StorageError):
                broker.update_location(pool["id"], payload)
        with self.assertRaises(broker.StorageError) as caught:
            broker.update_location("default", {"enabled": False})
        self.assertEqual(caught.exception.status, 404)

    def test_restore_missing_partition_never_recreates_source(self):
        pool = self.enable()
        self.mounts.remove(self.mount)
        shutil.rmtree(self.partition / "distribox")
        commands = list(self.commands)
        broker.restore()
        self.assertEqual(self.commands, commands)
        self.assertFalse((self.partition / "distribox").exists())
        self.assertEqual(broker.read_config()["pools"][0], pool)

    def test_restore_refuses_changed_marker(self):
        pool = self.enable()
        (Path(pool["source_path"]) / broker.MARKER).write_text("wrong partition")
        commands = list(self.commands)
        with self.assertLogs("distribox-storage", level="WARNING"):
            broker.restore()
        self.assertEqual(commands, self.commands)
        self.assertEqual((Path(pool["source_path"]) / broker.MARKER).read_text(), "wrong partition")

    def test_failed_bind_registration_can_be_retried_without_new_marker(self):
        with patch.object(broker, "mount_command", side_effect=broker.StorageError("mount failed")):
            with self.assertRaisesRegex(broker.StorageError, "mount failed"):
                self.enable()
        pool = broker.read_config()["pools"][0]
        recovered = self.enable()
        self.assertEqual(recovered, pool)
        self.assertIn(pool["path"], self.aliases)

    def test_source_swap_before_bind_cannot_expose_another_directory(self):
        unrelated = self.root / "unrelated"
        unrelated.mkdir()
        (unrelated / "private-file").write_text("do not expose")

        def bind_after_swap(*arguments, **kwargs):
            pinned, target = arguments[-2:]
            source = Path(os.readlink(pinned))
            source.rename(self.partition / "renamed-distribox")
            source.symlink_to(unrelated, target_is_directory=True)
            self.assertIn(int(pinned.rsplit("/", 1)[1]), kwargs["pass_fds"])
            self.fake_mount(*arguments, **kwargs)

        with patch.object(broker, "mount_command", side_effect=bind_after_swap):
            pool = self.enable()
        target = Path(pool["path"])
        self.assertFalse((target / "private-file").exists())
        self.assertEqual((target / broker.MARKER).read_text().strip(), pool["marker"])
        self.assertTrue(Path(pool["source_path"]).is_symlink())

    def test_restore_does_not_mount_invalid_config_target(self):
        pool = self.enable()
        config = broker.read_config()
        config["pools"][0]["path"] = "/etc"
        broker.CONFIG.write_text(json.dumps(config))
        commands = list(self.commands)
        with self.assertRaises(broker.StorageError):
            broker.restore()
        self.assertEqual(commands, self.commands)

    def test_restore_does_not_mount_invalid_source(self):
        self.enable()
        config = broker.read_config()
        config["pools"][0]["source_path"] = str(self.root / "secrets")
        broker.CONFIG.write_text(json.dumps(config))
        with self.assertRaises(broker.StorageError):
            broker.restore()

    def test_config_symlink_marker_is_rejected_on_restore(self):
        pool = self.enable()
        marker = Path(pool["source_path"]) / broker.MARKER
        marker.unlink()
        marker.symlink_to(broker.CONFIG)
        with self.assertLogs("distribox-storage", level="WARNING"):
            broker.restore()
        self.assertTrue(marker.is_symlink())


class ParsingAndOwnershipTest(unittest.TestCase):
    def test_mountinfo_unescapes_spaces_without_shell_parsing(self):
        contents = "123 1 8:2 / /VM\\040storage rw,relatime shared:3 - ext4 /dev/sdb1 rw\n"
        with patch.object(Path, "read_text", return_value=contents):
            mounts = broker.read_mounts()
        self.assertEqual(mounts[0]["mount_path"], "/VM storage")
        self.assertTrue(mounts[0]["shared"])

    def test_system_and_temporary_paths_are_not_eligible(self):
        for path in ("/", "/proc/x", "/sys/x", "/dev/x", "/boot", "/etc", "/run/media", "/var/lib", "/tmp/a", "/data/../etc"):
            with self.subTest(path=path):
                self.assertFalse(broker.eligible_path(Path(path)))
        self.assertTrue(broker.eligible_path(Path("/data")))

    def test_mounted_root_device_and_unsupported_filesystems_are_filtered(self):
        common = {"root": "/", "options": ["rw"], "source": "test", "shared": False}
        mounts = [{**common, "mount_path": "/", "device": "8:1", "filesystem": "ext4"},
                  {**common, "mount_path": "/home", "device": "8:1", "filesystem": "ext4"},
                  {**common, "mount_path": "/data", "device": "8:2", "filesystem": "ext4"},
                  {**common, "mount_path": "/scratch", "device": "8:3", "filesystem": "tmpfs"}]
        with patch.object(broker, "read_mounts", return_value=mounts):
            self.assertEqual([mount["mount_path"] for mount in broker.eligible_mounts()], ["/data"])

    def test_storage_ancestors_must_not_be_modifiable_by_others(self):
        for uid, mode in ((1000, 0o755), (0, 0o775), (0, 0o777)):
            with self.subTest(uid=uid, mode=mode), self.assertRaises(broker.StorageError):
                broker._root_owned(Path("/data"), SimpleNamespace(st_uid=uid, st_mode=mode))
        broker._root_owned(Path("/data"), SimpleNamespace(st_uid=0, st_mode=0o755))

    def test_user_owned_mount_is_allowed_but_managed_directory_must_be_trusted(self):
        def info(path):
            return SimpleNamespace(st_mode=stat.S_IFDIR | 0o755,
                                   st_uid=1000 if str(path) == "/data" else 0)

        with patch.object(broker, "read_mounts", return_value=[{"mount_path": "/data"}]), \
                patch.object(Path, "lstat", autospec=True, side_effect=info):
            broker.secure_path(Path("/data/distribox"), mount_root=Path("/data"))
            with self.assertRaises(broker.StorageError):
                broker.secure_path(Path("/data/distribox"))
        with patch.object(broker, "read_mounts", return_value=[]), \
                patch.object(Path, "lstat", autospec=True, side_effect=info):
            with self.assertRaises(broker.StorageError):
                broker.secure_path(Path("/data/distribox"), mount_root=Path("/data"))
        with patch.object(broker, "read_mounts", return_value=[{"mount_path": "/data"}]), \
                patch.object(Path, "lstat", return_value=SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=1000)):
            with self.assertRaises(broker.StorageError):
                broker.secure_path(Path("/data/distribox"), mount_root=Path("/data"))


class ProtocolTest(unittest.TestCase):
    class Connection:
        def __init__(self, request, uid):
            self.input = BytesIO(request)
            self.output = bytearray()
            self.uid = uid

        def settimeout(self, seconds):
            pass

        def makefile(self, *args):
            return self.input

        def getsockopt(self, *args):
            return struct.pack("3i", 123, self.uid, 0)

        def sendall(self, data):
            self.output.extend(data)

    def request(self, method, path, body="", *, uid=0, headers=None):
        headers = headers or {"Content-Length": str(len(body.encode()))}
        request = f"{method} {path} HTTP/1.0\r\n"
        request += "".join(f"{key}: {value}\r\n" for key, value in headers.items())
        connection = self.Connection((request + "\r\n" + body).encode(), uid)
        broker.Handler(connection, "", SimpleNamespace())
        status_line, _, content = connection.output.decode().partition("\r\n\r\n")
        return int(status_line.split()[1]), json.loads(content)

    def test_local_unprivileged_peer_is_rejected_before_discovery(self):
        with patch.object(broker, "discover") as discover:
            status, _ = self.request("GET", "/mounts", uid=1000)
        self.assertEqual(status, 403)
        discover.assert_not_called()

    def test_root_peer_can_discover(self):
        with patch.object(broker, "discover", return_value={"candidates": []}):
            status, response = self.request("GET", "/mounts")
        self.assertEqual(status, 200)
        self.assertEqual(response, {"candidates": []})

    def test_post_and_patch_pass_only_the_selected_route_payload(self):
        payload = {"mount_id": "mount-123", "name": "Data"}
        with patch.object(broker, "create_location", return_value={"id": "storage-1"}) as create:
            status, _ = self.request("POST", "/locations", json.dumps(payload))
        self.assertEqual(status, 200)
        create.assert_called_once_with(payload)
        with patch.object(broker, "update_location", return_value={"id": "storage-1"}) as update:
            status, _ = self.request("PATCH", "/locations/storage-1", '{"enabled": false}')
        self.assertEqual(status, 200)
        update.assert_called_once_with("storage-1", {"enabled": False})

    def test_query_parameters_and_unknown_routes_are_rejected(self):
        for method, path, expected in (("GET", "/mounts?path=/etc", 400), ("GET", "/etc", 404),
                                       ("PATCH", "/locations/../default", 404), ("POST", "/mounts", 404)):
            with self.subTest(method=method, path=path):
                status, _ = self.request(method, path, "{}")
                self.assertEqual(status, expected)

    def test_malformed_and_unbounded_requests_are_rejected(self):
        for body, headers in (("not json", None), ("{}", {"Content-Length": "5000"}),
                              ("{}", {"Content-Length": "-1"}), ("{}", {"Content-Length": "bad"}),
                              ("{}", {"Transfer-Encoding": "chunked"})):
            with self.subTest(body=body, headers=headers):
                status, _ = self.request("POST", "/locations", body, headers=headers)
                self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
