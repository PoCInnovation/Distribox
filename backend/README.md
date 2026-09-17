# Environment

If you are using the `docker-compose` **at the root**, you can use the `.env` **at the root** of the project to configure the application, you can skip the rest.

If you are running the backend **independently**, you will need to modify the database host in the `.env` file to `localhost`.
You will also need to create a symbolic link to the .env in the parent directory.

```bash
ln -s ../.env .env
```

SSH gateway configuration and guest requirements are documented in the root README. Run one backend worker per container when SSH is enabled: the worker owns the SSH listener.

For extra VM and image storage, follow [Store VMs on another partition](../README.md#store-vms-on-another-partition). The host service writes `/var/lib/distribox/storage.json` and manages mounts under `/var/lib/distribox/storage`. A standalone backend reads the same configuration and uses the same root-only Unix socket at `/var/lib/distribox/run/storage.sock`. Host libvirt accesses those identical paths.

Run the backend tests from the repository root after installing the backend requirements and `pytest pytest-asyncio`:

```bash
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend pytest backend/tests -q
```

These tests use temporary databases and in-process SSH servers. They do not start or modify deployed VMs.

Test the host storage service independently with `python3 -m unittest discover -s host/tests -v` from the repository root. These tests use temporary directories and mocked mount operations. When unprivileged Linux namespaces are available, an integration test also verifies real mount propagation in isolated namespaces. They do not configure actual partitions or modify the host's mounts.
