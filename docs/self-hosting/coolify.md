---
title: Deploying on Coolify
summary: One-click template, compose deployment, environment variables, domains, passkeys, Cloudflare, updates and troubleshooting.
audience: admin
specs: [self-hosting]
screens: []
order: 20
---
# Deploying OpenTodo on Coolify

OpenTodo is built to be a one-click Coolify resource: one service, one volume, no required variables.

## One-click template (pending in Coolify's service list)

[`deploy/coolify/opentodo.yaml`](https://github.com/pixari/opentodo/blob/main/deploy/coolify/opentodo.yaml) is a Coolify service template. It is prepared for Coolify's built-in service list and pending upstream review; Coolify only lists services whose repository has at least 1,000 GitHub stars, so it may take a while. Until **OpenTodo** shows up under **+ New Resource**, paste the template:

1. In your project choose **+ New → Docker Compose** (the option *without* a Git repository; older Coolify versions call it **Docker Compose Empty**).
2. Paste the contents of `deploy/coolify/opentodo.yaml` and save.
3. Open the `opentodo` service and set **Domains** to the https URL users will open, for example `https://todo.example.com`. Remove the generated `sslip.io` domain if you do not use it (see [Domains](#domains)).
4. Click **Deploy**, then open the domain. The setup screen asks for a **setup token**: copy `OPENTODO_SETUP_TOKEN` from the service's **Environment Variables** tab (Coolify generated it) and create the owner account (see [First visit](#first-visit)).

The template pulls the `stable` image, which every release moves, so each new release arrives on the next **Deploy**. It routes the domain to port 8080 (`SERVICE_URL_OPENTODO_8080`), passes it as `OPENTODO_BASE_URL`, protects the first account with a generated setup token, keeps sign-up closed, stores everything in one named volume and checks health with the binary itself. Its **Environment Variables** tab lists the useful optional settings with their defaults (below). To add any other `OPENTODO_*` variable, use **Edit Compose file** and add a line such as `- OPENTODO_MCP=${OPENTODO_MCP:-}`: Coolify passes a variable to the container only when the compose file references it.

## Option A: Docker Compose from the repository

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

The compose file pulls the published image `ghcr.io/pixari/opentodo:stable`, which every release moves. Use a release line (`:0.9`) to take only its fixes, or `:latest` to follow `main` with unreleased changes. To build from your fork instead, change `image:` to `build: .` in the compose file; Coolify will build the multi-stage Dockerfile on the server. A build from source reports version `dev`; with the Dockerfile build pack, set **Advanced → Source commit availability** to *Available during build* and it reports `dev+<commit>`.

## Option B: Dockerfile build pack

If you prefer not to use compose:

1. **+ New Resource → Public Repository**, build pack **Dockerfile**.
2. **Port**: `8080`.
3. **Persistent Storage**: add a volume mounted at `/data`.
4. **Environment variables** (optional): `OPENTODO_BASE_URL=https://todo.example.com`.
5. Deploy.

## Option C: Docker image

**+ New Resource → Docker Image**, image `ghcr.io/pixari/opentodo:stable`, port `8080`, volume at `/data`.

## Environment variables

None is required. With a Compose resource (the one-click template or Option A), a variable you add in Coolify's **Environment Variables** tab reaches the container **only if the compose file references it**; anything else is silently ignored. Both compose files reference the variables below (the template the most common ones, `docker-compose.yml` all of them); add a line with **Edit Compose file** for any other. The complete list is in the [README](../../README.md#configuration).

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | set by Coolify | Public URL. Enables `Secure` cookies, strict origin checks and, when https, passkeys. Leave empty to use the service's (first) domain |
| `OPENTODO_TRUSTED_PROXIES` | unset | `cloudflare` when the domain is proxied by Cloudflare (orange cloud); see [Behind Cloudflare](#behind-cloudflare) |
| `OPENTODO_SETUP_TOKEN` | generated by the template | Creating the first account requires it (16+ characters). The template sets it to `${SERVICE_PASSWORD_SETUP}`; it has no effect once the owner exists. See [First visit](#first-visit) |
| `OPENTODO_ALLOW_SIGNUP` | `false` | Allow anyone to create an account after the owner. Prefer invitations (below) |
| `OPENTODO_SESSION_DAYS` | `90` | Session lifetime |
| `OPENTODO_LOG_LEVEL` | `info` | `debug` logs every API request |
| `OPENTODO_IMPORT_MAX_MB` | `20` | Largest import file (1–200 MB); see [import](../import.md) |
| `OPENTODO_TRASH_RETENTION_DAYS` | `30` | Days a deleted item stays in the Trash before it is purged for good (0–3650; `0` never purges automatically). See [sync](../sync.md#purge) |
| `OPENTODO_PUSH` | `on` | `off` disables web push for reminders (no outbound requests to push services); reminders are still shown in the app. See [docker.md](docker.md#reminders-and-web-push) |
| `OPENTODO_MCP` | unset | `true` presets the AI assistants (MCP) endpoint on first start; afterwards Settings → Integrations → AI assistants decides. See [mcp](../mcp.md) |
| `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` | unset | Presets "allow private network targets" for webhooks on first start; afterwards Settings → Integrations → Webhooks decides. See [webhooks](../webhooks.md#private-network-protection) |
| `OPENTODO_CALDAV` | unset | `true` presets the CalDAV endpoint for calendar apps on first start; afterwards Settings → Integrations → Calendar apps decides. See [caldav](../caldav.md) |
| `OPENTODO_CALENDAR_FEEDS` | unset | `true` presets calendar feeds (subscribed calendars and task feed URLs) on first start; afterwards Settings → Integrations → Calendar feeds decides. See [calendar feeds](../calendar-feeds.md) |
| `OPENTODO_EMAIL_*` | unset | Optional [email to task](../email.md): `ADDRESS`, `IMAP_HOST`, `IMAP_USER` and `IMAP_PASSWORD` together (mark the password as a secret, or mount a file and set `IMAP_PASSWORD_FILE`). Partial settings stop the container at startup with the missing name in the log |
| `OPENTODO_SMTP_*` | unset | Optional [outgoing email](outgoing-email.md) (`HOST`, `SECURITY`, `USER`, `PASSWORD` or `PASSWORD_FILE`, `FROM`; `HOST` and `FROM` together). Mark the password as a secret. Each one set locks its field in Settings → Server → Outgoing email |
| `OPENTODO_OIDC_*` | unset | Optional [single sign-on](sso.md) settings (`ISSUER`, `CLIENT_ID`, `CLIENT_SECRET`, `DISPLAY_NAME`, `SSO_ONLY`) that override and lock the fields in Settings → People → Single sign-on |
| `OPENTODO_BACKUP_*` | unset | Optional presets for [scheduled backups](../backups.md#environment-presets), applied once; Settings → Server wins afterwards |

## Passkeys

Users can add passkeys in **Settings → Account → Passkeys** once the domain is https, which Coolify provisions when the domain starts with `https://`. Passkeys are tied to the domain's host. If you later change the domain assigned to the service, existing passkeys stop working: users sign in with their password and register new ones. Passwords are never disabled by passkeys. Details in [Running with Docker](docker.md#passkeys-need-an-https-base-url).

## First visit

A Coolify service is public as soon as it is deployed. The one-click template therefore sets `OPENTODO_SETUP_TOKEN` to a secret Coolify generates (`${SERVICE_PASSWORD_SETUP}`): the setup screen asks for it, so a stranger who opens the URL before you cannot create the owner. Find the value in the service's **Environment Variables** tab, paste it into **Setup token** together with your email and password, and you are the owner. Afterwards the token does nothing; sign-up and invitations decide who else may join.

With Option A, B or C, set `OPENTODO_SETUP_TOKEN` yourself (any value of 16 characters or more) for the same protection. Without it the first visitor creates the owner, so open the domain yourself as soon as the deployment finishes. If someone else got there first (the setup screen is gone and you have no account), delete the resource together with its volume and deploy again.

## Domains

Coolify gives the app the **first** domain of the service as `OPENTODO_BASE_URL`; passkeys, invitation links and cookie checks use that host only. Keep one domain on the service, the one users open. If you need two (for example an old and a new name), set `OPENTODO_BASE_URL` in the environment tab to the one users should use; an explicit value wins over the generated one. After changing the domain, redeploy: the app picks up the new URL, users sign in again on the new host, and passkeys registered under the old host must be added again.

## Adding people

Leave `OPENTODO_ALLOW_SIGNUP` unset. In the app, open **Settings → People → Members**, create an invitation (optionally bound to an email, expiring in 1 hour to 30 days) and send the link. It creates one account and then stops working; pending links can be revoked. Links use `OPENTODO_BASE_URL`, which the compose file sets from Coolify's domain. See [Adding people](../../README.md#adding-people). **Settings → People → Users** manages accounts afterwards: admins, deactivation, reset links, deletion and owner transfer. If the owner forgot their password, open the service's terminal in Coolify and run `/opentodo reset-owner-password` (see [Recovering owner access](docker.md#recovering-owner-access)).

## Backups

Everything is in the `/data` volume (one file, `opentodo.db`, plus its WAL files while running, the web push keys and settings secrets). Turn on scheduled backups in **Settings → Server**: consistent snapshots to `/data/backups`, an S3-compatible bucket or a WebDAV share, with retention and optional encryption, restorable with `opentodo restore` (see [docs/backups.md](../backups.md#restore)). Coolify's scheduled volume backups archive the volume with `tar`; a copy taken while the server writes can catch the database mid-write, so set **Archive behavior** to *Stop containers during archive* there, or rely on the built-in backups. The in-app **Settings → Data → Download export** gives a portable JSON copy at any time.

## Audit log

**Settings → Account → Audit log** (owner only) lists sign-ins, failed sign-ins, credentials, invitations, user administration, exports, backups and setting changes, with filters and an NDJSON export. It lives in the `/data` volume with everything else and needs no configuration: retention defaults to 90 days, client addresses are off by default. If you enable address logging, the address is the hop Traefik appended to `X-Forwarded-For`, which Coolify sets for you; the header is believed only because Traefik connects from Coolify's private Docker network, so a client that reaches the container port directly is recorded with its own address. Expect roughly 200 bytes per event. Details in [Running with Docker](docker.md#audit-log).

## Updating

Click **Deploy**. The new version applies database migrations on startup, and your data stays in the volume.

- **Pulling.** For a Compose resource (the one-click template or Option A), **Deploy** and **Restart (pull latest)** pull the image again; a plain **Restart** reuses the image already on the server. Deploying a service through Coolify's API or a webhook (`/api/v1/deploy`) does not pull either; use `/api/v1/services/{uuid}/restart?latest=true`. With a moving tag such as `stable`, `0.8` or `latest`, a server that only restarts keeps running the old build. After an update, check the version at the bottom of the sign-in screen or at `https://todo.example.com/healthz`.
- **New releases.** With `stable`, **Deploy** installs the newest release, minor versions included; migrations run on start and there are no down-migrations, so keep backups on. A service created before the template used `stable` keeps its tag (Coolify does not change the compose file of an existing service): change it to `stable` once in **Edit Compose file** and click **Deploy**.
- **Downtime.** Compose resources are recreated: Coolify stops the old container and starts the new one (`docker compose up --force-recreate`), a few seconds without service. The Dockerfile and Docker Image build packs (Options B and C) roll: Coolify starts the new container while the old one still serves, waits for its health check, then stops the old one. Both may serve the same volume for those few seconds; background jobs (reminder push, webhooks, backups, email, Trash cleanup) stay with the old container until it stops, then the new one takes them over. Migrations are additive, so the old version keeps working on the upgraded database until it is replaced. The image's health check reports healthy about 2 seconds after start, so a rolling update waits only a few seconds.

**Upgrading from 0.1.0 to 0.2.0:** 0.1.0 locked the volume exclusively, so its replacement cannot start beside it ("data directory is in use by another opentodo process", and Coolify rolls back). For this one upgrade, click **Stop**, then **Deploy** (a minute of downtime while the new image starts). From 0.2.0 on, updates roll without stopping. If you pinned the image tag (for example `ghcr.io/pixari/opentodo:0.1` in [`deploy/coolify/opentodo.yaml`](https://github.com/pixari/opentodo/blob/main/deploy/coolify/opentodo.yaml)), change it to `0.2` first.

## Behind Cloudflare

When the domain's DNS record is proxied by Cloudflare (orange cloud), every request reaches Coolify's proxy from a Cloudflare address. Set `OPENTODO_TRUSTED_PROXIES=cloudflare` in the environment tab and redeploy, so rate limits and the audit log see visitors' addresses (from `CF-Connecting-IP`) instead of one shared Cloudflare address. With a Cloudflare Tunnel instead, requests arrive from the `cloudflared` container on Coolify's Docker network, a private address that OpenTodo trusts by default, so nothing needs setting; check **Settings → Account → Audit log** with addresses enabled to confirm it shows your own address. See [Behind a reverse proxy](docker.md#behind-a-reverse-proxy).

The server sends the service worker with `Cache-Control: no-store`, so phones pick up a new version on their next visit. Keep Cloudflare's **Caching → Configuration → Browser Cache TTL** at *Respect Existing Headers*, and do not add a Cache Rule that caches everything, or Cloudflare may serve an old app shell for hours.

## Live updates

Devices learn about each other's changes through a long-lived request, `GET /api/v1/sync/events` (server-sent events). Coolify's Traefik proxy streams it as is: no labels or settings are needed. The server heartbeats every 25 s, below Traefik's idle timeouts, and sets no-buffering headers. Use an `https://` domain so Traefik serves HTTP/2 and the streams of several tabs share one connection.

## Troubleshooting

- **Update rolled back with "data directory is in use by another opentodo process"**: the running container is 0.1.0, which locked the volume exclusively. Stop the resource, then deploy; from 0.2.0 on, updates roll without stopping.
- **"No Available Server" on the domain**: make sure the domain is assigned to the `opentodo` service with port `8080` (the compose file does this through `SERVICE_FQDN_OPENTODO_8080`).
- **Status pill shows "Polling" instead of "Live"**: something between the browser and the container is buffering or cutting the event stream. Open `https://todo.example.com/api/v1/sync/events?device=test` while signed in: you should see `: connected` at once and `: ping` every 25 s. With stock Coolify this works out of the box; check any extra proxy, CDN or corporate firewall in front of it (see the proxy notes in [docker.md](docker.md)). The app keeps working with 30 s polling in the meantime.
- **Sign-in works on desktop but not on the phone**: the domain must be https. Coolify handles this when the domain starts with `https://`.
- **No "Sign in with a passkey" button / 409 `passkeys_unavailable`**: `OPENTODO_BASE_URL` is missing or not `https://`. Set it to the URL users open.
- **"The origin of the document is not authorized for the provided RP ID" / "Passkeys on this server are set up for X, but this page is open at Y"**: the app is opened at a different host than `OPENTODO_BASE_URL`. This happens when the service has more than one domain (for example the generated `*.sslip.io` one and your own) or the domain changed after the first deploy. Keep only the domain users open on the service, or set `OPENTODO_BASE_URL=https://your.domain` in the environment tab (it wins over Coolify's generated URL), then redeploy. Passkeys registered under the old host must be added again.
- **Cookie rejected / 403 `bad_origin`**: `OPENTODO_BASE_URL` must match the URL users open, including the scheme.
- **Typo in `OPENTODO_TRUSTED_PROXIES`** (for example `cloudflar`): the server still starts and the deploy succeeds; the invalid entry is ignored and the other entries apply (with none valid, it behaves as if the variable were unset). The owner sees a **Server configuration warning** at the top of **Settings** and **Settings → People**, and the container log (**Logs** tab) has an error line `OPENTODO_TRUSTED_PROXIES: invalid entries ignored` with a hint. Fix the value in the environment tab and redeploy. Before this change such a typo stopped the container, so the health check failed and Coolify rolled the deploy back. See [Behind a reverse proxy](docker.md#behind-a-reverse-proxy).
- **Permission denied writing `/data`**: when using a bind mount instead of a named volume, the directory must be writable by uid 65532 (`chown 65532:65532 ./data`).
