# Desktop profiling

Profiling is off by default. Enable it with the Compose override:

```sh
docker compose -f docker-compose.yml -f docker-compose.profiling.yml --profile master up -d --build
```

Use `dev` or `slave` instead of `master` as needed. Enable the override on the VM's
host for native statistics.

Add `profiling=1` to the viewer's query string. Click **Record 15 seconds**, then
**Download JSON**. Recording stops automatically or on disconnect. Older Gliss
releases without profiling support show an unavailable message.

Reports stay local and exclude credentials, inputs and pixels. CPU covers the
Gliss process only; browser timings end at Canvas submission.

To disable profiling, omit the override and run `up -d --build` again.
