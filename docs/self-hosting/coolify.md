# Deploying OpenTodo on Coolify

OpenTodo is built to be a one-click Coolify resource: one service, one volume, no required variables.

## Option A: Docker Compose from the repository (recommended)

1. In your Coolify project choose **+ New Resource → Public Repository** (or your fork via the GitHub app).
2. Repository URL: `https://github.com/pixari/opentodo`, branch `main`.
3. **Build pack: Docker Compose**. Leave *Base directory* as `/` and *Docker Compose location* as `/docker-compose.yml`.
4. Coolify reads the compose file and shows the `opentodo` service. Under **Domains** assign your domain to it, for example `https://todo.example.com`. The compose file already declares `SERVICE_FQDN_OPENTODO_8080`, so the proxy targets container port 8080 and HTTPS is provisioned automatically.
5. Click **Deploy**. Open the domain and create the owner account.

What the compose file does for you:

- `SERVICE_FQDN_OPENTODO_8080` tells Coolify which service and internal port receive the domain.
- `OPENTODO_BASE_URL=${SERVICE_URL_OPENTODO}` passes the public https URL to the app so cookies are `Secure` and cross-site writes are rejected.
- `opentodo-data:/data` is a named volume Coolify manages; it holds the single SQLite database.
- The health check uses the binary itself, so Coolify shows the service as healthy or unhealthy correctly.
- `ports:` is ignored by Coolify's proxy routing and only matters for plain Docker.

By default the compose file pulls the published image `ghcr.io/pixari/opentodo:latest`. To build from your fork instead, change `image:` to `build: .` in the compose file; Coolify will build the multi-stage Dockerfile on the server.

## Option B: Dockerfile build pack

If you prefer not to use compose:

1. **+ New Resource → Public Repository**, build pack **Dockerfile**.
2. **Port**: `8080`.
3. **Persistent Storage**: add a volume mounted at `/data`.
4. **Environment variables** (optional): `OPENTODO_BASE_URL=https://todo.example.com`.
5. Deploy.

## Option C: Docker image

**+ New Resource → Docker Image**, image `ghcr.io/pixari/opentodo:latest`, port `8080`, volume at `/data`.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | set by Coolify | Public URL. Enables `Secure` cookies and strict origin checks |
| `OPENTODO_ALLOW_SIGNUP` | `false` | Allow others to create accounts after the owner |
| `OPENTODO_SESSION_DAYS` | `90` | Session lifetime |
| `OPENTODO_LOG_LEVEL` | `info` | `debug` logs every API request |

## Backups

Everything is in the `/data` volume (one file, `opentodo.db`, plus its WAL files while running). Use Coolify's volume backup, or copy the directory while the container is stopped. The in-app **Settings → Download export** gives a portable JSON copy at any time.

## Updating

Redeploy the resource. Coolify pulls the new image (or rebuilds), the new version applies database migrations on startup, and your data stays in the volume.

## Troubleshooting

- **"No Available Server" on the domain**: make sure the domain is assigned to the `opentodo` service with port `8080` (the compose file does this through `SERVICE_FQDN_OPENTODO_8080`).
- **Sign-in works on desktop but not on the phone**: the domain must be https. Coolify handles this when the domain starts with `https://`.
- **Cookie rejected / 403 `bad_origin`**: `OPENTODO_BASE_URL` must match the URL users open, including the scheme.
- **Permission denied writing `/data`**: when using a bind mount instead of a named volume, the directory must be writable by uid 65532 (`chown 65532:65532 ./data`).
