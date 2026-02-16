# Environment

If you are using the `docker-compose` **at the root**, you can use the `.env` **at the root** of the project to configure the application, you can skip the rest.

If you are running the backend **independently**, you will need to modify the database host in the `.env` file to `localhost`.
You will also need to create a symbolic link to the .env in the parent directory.

```bash
ln -s ../.env .env
```
