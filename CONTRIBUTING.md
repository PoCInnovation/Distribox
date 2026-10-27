# Contributing to Distribox

Start with an [open issue](https://github.com/PoCInnovation/Distribox/issues), or browse the [good first issues](https://github.com/PoCInnovation/Distribox/labels/good%20first%20issue). Comment on an issue before starting so other contributors know it is being worked on.

To report a problem, use the [bug report](https://github.com/PoCInnovation/Distribox/issues/new?template=bug_report.yml) template and include reproduction steps, expected behavior, and relevant logs. For an idea, open a [feature request](https://github.com/PoCInnovation/Distribox/issues/new?template=feature_request.yml) describing the problem it would solve.

## Find your way around

- [frontend/](frontend/): React Router dashboard, event invitations, and browser desktop client.
- [backend/](backend/): FastAPI backend, VM lifecycle, authentication, and master/slave coordination.
- [atlas/](atlas/): TypeScript CLI for the S3 image registry.
- [images/](images/): VM image builders and guest utilities.
- [setup.sh](setup.sh), [setup/](setup/), and [nix/](nix/): host installation and configuration.
- [.github/workflows/ci.yml](.github/workflows/ci.yml): checks run for pushes and pull requests.

## Fork and create a branch

Fork [PoCInnovation/Distribox](https://github.com/PoCInnovation/Distribox/fork) on GitHub. Replace `YOUR_GITHUB_USERNAME` below with your account name:

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/Distribox.git
cd Distribox
git remote add upstream https://github.com/PoCInnovation/Distribox.git
git switch -c fix/short-description
```

## Run checks without a VM host

Documentation changes need no application setup. Frontend checks, Atlas builds, and the backend test suite can run without a KVM host, running guests, or AWS credentials.

### Frontend

Use Node.js 24, as in the frontend Docker image, and pnpm 12.4.2, as pinned in CI. From the repository root:

```sh
corepack enable
corepack prepare pnpm@12.4.2 --activate
cd frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm dlx prettier --check app
```

Run `pnpm dev --host` from `frontend/` for hot reloading. Screens that use live data need a running backend; see the [frontend environment guide](frontend/README.md).

### Backend

Use Python 3.13. Installing `libvirt-python` also requires a C compiler, `pkg-config`, and libvirt development headers (`libvirt-dev` on Debian/Ubuntu). A running libvirt service is not required for the tests.

From the repository root:

```sh
python3.13 -m venv backend/venv
. backend/venv/bin/activate
python -m pip install -r backend/requirements.txt pytest pytest-asyncio autopep8 mypy==2.3.1
AWS_EC2_METADATA_DISABLED=true PYTHONPATH=backend python -m pytest backend/tests -q
(cd backend && python -m mypy app/ --ignore-missing-imports)
python -m autopep8 --diff --recursive --select=E,W backend/app/
```

The tests use temporary databases, mocked virtualization calls, and in-process SSH servers. They do not start or modify deployed VMs. The final command prints formatting differences; apply any needed formatting to the files you changed.

### Atlas

Atlas pins its own pnpm version, 10.15.1. From the repository root:

```sh
corepack enable
corepack prepare pnpm@10.15.1 --activate
cd atlas
pnpm install --frozen-lockfile
pnpm build
```

Building needs no AWS credentials. Registry operations do; see the [Atlas guide](atlas/README.md) before using them.

## Run the full application

Follow the [Quickstart](README.md#quickstart) for host prerequisites, environment configuration, and Docker Compose profiles. Full VM testing requires an x86_64 Linux host with libvirt and QEMU. Image-building instructions are in the [images guide](images/README.md).

To use the development Compose profile, configure the host and `.env` as described in the Quickstart, then run from the repository root:

```sh
docker compose --profile dev up --build
```

## Submit a pull request

Keep each contribution focused and run the checks for the component you changed. For a bug fix, include regression coverage when practical and verify the user-visible behavior.

Use one short Conventional Commits subject for each commit, such as `fix(vm): handle an offline slave` or `docs(contributing): clarify local checks`.

```sh
git add path/to/changed-file
git commit -m "fix(component): describe the change"
git push -u origin fix/short-description
```

Open a pull request from your fork's branch to `PoCInnovation/Distribox`'s `main` branch, with a short Conventional Commits title.

To update your branch with upstream changes:

```sh
git fetch upstream
git rebase upstream/main
git push --force-with-lease origin fix/short-description
```
