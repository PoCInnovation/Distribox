# Environment

If you are using the `docker-compose` **at the root**, you can use the `.env` **at the root** of the project to configure the application, you can skip the rest.

If you are running the backend **independently**, you will need to modify the database host in the `.env` file to `localhost`.
You will also need to create a symbolic link to the .env in the parent directory.

```bash
ln -s ../.env .env
```

SSH gateway configuration and guest requirements are documented in the root README. Run one backend worker per container when SSH is enabled: the worker owns the SSH listener.

Run the SSH tests from the repository root after installing the backend requirements and `pytest pytest-asyncio`:

```bash
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend pytest backend/tests -q
```

These tests use temporary databases and in-process SSH servers. They do not start or modify deployed VMs.
