To start the default (production) environment (without automatic rebuilds):

```bash
docker compose up --build
```

This will:
*   Build the `backend` service using the `production-stage` in `backend/Dockerfile`.
*   Build the `frontend` service using the `production-stage` in `frontend/Dockerfile`.
*   Start the `database` service.

To start the development environment with automatic rebuilds for both backend and frontend:

```bash
docker compose --profile dev up --build
```

This command will:
*   Build the `backend-dev` service using the `dev-stage` in `backend/Dockerfile`, with `uvicorn --reload`.
*   Mount your local `backend/app` and `backend/.env` directories into the container for hot-reloading.
*   Build the `frontend-dev` service using the `dev-stage` in `frontend/Dockerfile`, with `pnpm dev`.
*   Mount your local `frontend` directory into the container for hot-reloading.
*   Start the `database` service.