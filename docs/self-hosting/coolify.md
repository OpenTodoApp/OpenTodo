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
- `OPENTODO_BASE_URL=${SERVICE_URL_OPENTODO}` passes the public https URL to the app so cookies are `Secure`, cross-site writes are rejected, and passkeys are available (see [Passkeys](#passkeys)).
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
| `OPENTODO_BASE_URL` | set by Coolify | Public URL. Enables `Secure` cookies, strict origin checks and, when https, passkeys |
| `OPENTODO_ALLOW_SIGNUP` | `false` | Allow anyone to create an account after the owner. Prefer invitations (below) |
| `OPENTODO_SESSION_DAYS` | `90` | Session lifetime |
| `OPENTODO_LOG_LEVEL` | `info` | `debug` logs every API request |
| `OPENTODO_IMPORT_MAX_MB` | `20` | Largest import file (1–200 MB); see [import](../import.md) |
| `OPENTODO_TRASH_RETENTION_DAYS` | `30` | Days a deleted item stays in the Trash before it is purged for good (0–3650; `0` never purges automatically). See [sync](../sync.md#purge) |
| `OPENTODO_PUSH` | `on` | `off` disables web push for reminders (no outbound requests to push services); reminders are still shown in the app. See [docker.md](docker.md#reminders-and-web-push) |
| `OPENTODO_MCP` | unset | `true` presets the read-only AI assistants (MCP) endpoint on first start; afterwards Settings → AI assistants decides. See [mcp](../mcp.md) |
| `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` | unset | Presets "allow private network targets" for webhooks on first start; afterwards Settings → Webhooks decides. See [webhooks](../webhooks.md#private-network-protection) |

## Passkeys

Users can add passkeys in **Settings → Security** once the domain is https, which Coolify provisions when the domain starts with `https://`. Passkeys are tied to the domain's host. If you later change the domain assigned to the service, existing passkeys stop working: users sign in with their password and register new ones. Passwords are never disabled by passkeys. Details in [Running with Docker](docker.md#passkeys-need-an-https-base-url).

## Adding people

Leave `OPENTODO_ALLOW_SIGNUP` unset. In the app, open **Settings → Members**, create an invitation (optionally bound to an email, expiring in 1 hour to 30 days) and send the link. It creates one account and then stops working; pending links can be revoked. Links use `OPENTODO_BASE_URL`, which the compose file sets from Coolify's domain. See [Adding people](../../README.md#adding-people). **Settings → Users** manages accounts afterwards: admins, deactivation, reset links, deletion and owner transfer. If the owner forgot their password, open the service's terminal in Coolify and run `/opentodo reset-owner-password` (see [Recovering owner access](docker.md#recovering-owner-access)).

## Backups

Everything is in the `/data` volume (one file, `opentodo.db`, plus its WAL files while running). Turn on scheduled backups in **Settings → Backups**: consistent snapshots to `/data/backups`, an S3-compatible bucket or a WebDAV share, with retention and optional encryption, restorable with `opentodo restore` (see [docs/backups.md](../backups.md#restore)). Coolify's volume backup, or copying the directory while the container is stopped, works too. The in-app **Settings → Download export** gives a portable JSON copy at any time.

## Audit log

**Settings → Audit log** (owner only) lists sign-ins, failed sign-ins, tokens, invitations, exports and audit setting changes, with filters and an NDJSON export. It lives in the `/data` volume with everything else and needs no configuration: retention defaults to 90 days, client addresses are off by default. If you enable address logging, the address comes from Traefik's `X-Forwarded-For` header, which Coolify sets for you; do not publish the container port directly, or clients could bypass the proxy and forge that header. Expect roughly 200 bytes per event. Details in [Running with Docker](docker.md#audit-log).

## Updating

Redeploy the resource. Coolify pulls the new image (or rebuilds), the new version applies database migrations on startup, and your data stays in the volume.

## Live updates

Devices learn about each other's changes through a long-lived request, `GET /api/v1/sync/events` (server-sent events). Coolify's Traefik proxy streams it as is: no labels or settings are needed. The server heartbeats every 25 s, below Traefik's idle timeouts, and sets no-buffering headers. Use an `https://` domain so Traefik serves HTTP/2 and the streams of several tabs share one connection.

## Troubleshooting

- **"No Available Server" on the domain**: make sure the domain is assigned to the `opentodo` service with port `8080` (the compose file does this through `SERVICE_FQDN_OPENTODO_8080`).
- **Status pill shows "Polling" instead of "Live"**: something between the browser and the container is buffering or cutting the event stream. Open `https://todo.example.com/api/v1/sync/events?device=test` while signed in: you should see `: connected` at once and `: ping` every 25 s. With stock Coolify this works out of the box; check any extra proxy, CDN or corporate firewall in front of it (see the proxy notes in [docker.md](docker.md)). The app keeps working with 30 s polling in the meantime.
- **Sign-in works on desktop but not on the phone**: the domain must be https. Coolify handles this when the domain starts with `https://`.
- **No "Sign in with a passkey" button / 409 `passkeys_unavailable`**: `OPENTODO_BASE_URL` is missing or not `https://`. Set it to the URL users open.
- **Cookie rejected / 403 `bad_origin`**: `OPENTODO_BASE_URL` must match the URL users open, including the scheme.
- **Permission denied writing `/data`**: when using a bind mount instead of a named volume, the directory must be writable by uid 65532 (`chown 65532:65532 ./data`).
