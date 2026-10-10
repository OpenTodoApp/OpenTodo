# Running OpenTodo with Docker

## Docker Compose

```bash
git clone https://github.com/pixari/opentodo.git
cd opentodo
cp .env.example .env        # optional
docker compose up -d
```

Open <http://localhost:8080>. The first visitor creates the owner account.

- Data lives in the named volume `opentodo-data`, mounted at `/data`.
- Change the host port with `OPENTODO_PORT` in `.env`.
- To build locally instead of pulling: replace `image: ghcr.io/pixari/opentodo:latest` with `build: .`.

## Plain `docker run`

```bash
docker run -d --name opentodo \
  -p 8080:8080 \
  -v opentodo-data:/data \
  -e OPENTODO_BASE_URL=https://todo.example.com \
  ghcr.io/pixari/opentodo:latest
```

## Behind a reverse proxy

OpenTodo speaks plain HTTP on 8080 and expects the proxy to terminate TLS. Set `OPENTODO_BASE_URL` to the public https URL so cookies are marked `Secure` and the origin check matches. The server also honours `X-Forwarded-Host` and `X-Forwarded-For` for the origin check and rate limiting.

Caddy example:

```
todo.example.com {
    reverse_proxy opentodo:8080
}
```

## Bind mounts

The container runs as uid 65532 (distroless `nonroot`). A bind-mounted data directory must be writable by that user:

```bash
mkdir -p ./data && sudo chown 65532:65532 ./data
docker run -v "$PWD/data:/data" ...
```

## Backup and restore

Stop the container (or accept a WAL-consistent snapshot) and copy `/data`. To restore, place the files back and start the container. A JSON export is also available from **Settings** in the app or `GET /api/v1/export` with an API token.

## Health

`GET /healthz` returns `{"status":"ok","version":"..."}`. The image defines a `HEALTHCHECK` that runs `/opentodo healthcheck`, which works without curl or a shell.

## Resource usage

Idle memory is around 25 MB; the binary is about 12 MB. A Raspberry Pi 3 or any 1 vCPU / 512 MB VPS is plenty.
