# Running OpenTodo with Docker

## Docker Compose

```bash
git clone https://github.com/pixari/opentodo.git
cd opentodo
cp .env.example .env        # optional
docker compose up -d
```

Open <http://localhost:8080>. The first visitor creates the owner account.

To add more people, keep sign-up closed and create single-use invitation links in **Settings → Members** (see [Adding people](../../README.md#adding-people)). `OPENTODO_ALLOW_SIGNUP=true` opens registration to anyone who can reach the server and is rarely what you want on a public URL.

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

OpenTodo speaks plain HTTP on 8080 and expects the proxy to terminate TLS. Set `OPENTODO_BASE_URL` to the public https URL so cookies are marked `Secure`, the origin check matches and invitation links point at the public address. The server also honours `X-Forwarded-Host` and `X-Forwarded-For` for the origin check and rate limiting.

### Passkeys need an https base URL

Passkeys (Settings → Security) are only offered when `OPENTODO_BASE_URL` is an `https://` URL; browsers refuse WebAuthn on plain-http origins. With no base URL or an `http://` LAN address, the server keeps working with passwords and simply hides passkeys (`auth/status` reports `passkeysAvailable: false`). For local development `http://localhost:8080` also works, because browsers treat localhost as secure.

Passkeys are bound to the **host** of that URL (the relying-party id, for example `todo.example.com`). If you move the server to a new domain, existing passkeys stop matching: users sign in with their password and register new passkeys from Settings. Paths and ports do not matter, only the host. See [SECURITY.md](../../SECURITY.md) for the credential model.

Caddy example:

```
todo.example.com {
    reverse_proxy opentodo:8080
}
```

### Live updates through the proxy

Each open tab keeps one long-lived request open, `GET /api/v1/sync/events`, a server-sent event stream the server uses to tell devices "new changes, sync now". It needs nothing special from Caddy, Traefik (Coolify) or nginx with default settings, because the server already:

- sends `Cache-Control: no-cache` and `X-Accel-Buffering: no` (nginx honours the latter and stops buffering that response),
- flushes after every write and sends a `: ping` heartbeat every 25 s, below the usual 30–60 s idle timeouts,
- caps streams at 16 per account and closes them cleanly on shutdown.

Things to keep in mind:

- **Buffering.** If a proxy buffers whole responses (older nginx configs with `proxy_buffering on` and no respect for `X-Accel-Buffering`, or some CDN "optimisation" layers), the stream never opens. For nginx add `proxy_buffering off;` to the `location` that proxies OpenTodo, or at least `proxy_http_version 1.1;` and leave `X-Accel-Buffering` enabled.
- **Idle timeouts.** Any read/response timeout on the proxy shorter than 25 s will cut the stream (the client reconnects, but it is wasteful). The defaults of Caddy, Traefik and nginx (`proxy_read_timeout 60s`) are fine.
- **HTTP/2 is recommended.** Browsers allow only six HTTP/1.1 connections per origin, and every open tab holds one for the stream. Terminate TLS at the proxy with HTTP/2 (the default for Caddy and Traefik with https) and the streams are multiplexed over one connection. On plain HTTP/1.1 keep the number of open tabs small.

Troubleshooting "live updates disconnected" (the status pill says **Polling** instead of **Live**):

1. Open `https://todo.example.com/api/v1/sync/events?device=test` in a signed-in browser tab. You should see `: connected` immediately and `: ping` every 25 s. If the page keeps loading with nothing shown, the proxy is buffering.
2. If it works but drops after a fixed time, a timeout somewhere in the chain is shorter than the heartbeat; raise it above 25 s.
3. Nothing is lost either way: while the stream is down the app polls every 30 s exactly as before.

## Reminders and web push

Reminders are shown in the app on every device and, for devices that enable notifications in **Settings → Notifications**, sent as web push so a closed app still notifies. Nothing needs configuring: on first use the server generates a VAPID key pair at `<data>/push_vapid.pem` (mode 0600). Keep it with the database: it is included in backup archives and restored with them, and existing subscriptions only work with the key they were created for.

Sending a push is the one outbound request the server makes: it goes to the push service the user's own browser chose when it subscribed (Google, Mozilla, Apple…), carries an encrypted payload the push service cannot read, and by default contains only ids (the device opts in to task titles). Browsers require https for push, so set `OPENTODO_BASE_URL` to your public https URL (it is also sent as the VAPID contact). To forbid outbound traffic set `OPENTODO_PUSH=off`: the push routes answer 404, no push is sent, and reminders are still shown in the app.

## Bind mounts

The container runs as uid 65532 (distroless `nonroot`). A bind-mounted data directory must be writable by that user:

```bash
mkdir -p ./data && sudo chown 65532:65532 ./data
docker run -v "$PWD/data:/data" ...
```

## Backup and restore

Turn on scheduled backups in **Settings → Backups** (owner only): consistent snapshots of the database, taken while the server runs, written to `/data/backups`, an S3-compatible bucket or a WebDAV share, with retention and optional encryption. Restore with the binary in the image while the container is stopped:

```bash
docker compose stop opentodo
docker compose run --rm --no-deps opentodo restore /data/backups/opentodo-20261010-030000-4f1c0a9e.tar.gz
docker compose start opentodo
```

Destinations, encryption, the archive format and the full restore procedure (including encrypted and downloaded archives) are in [docs/backups.md](../backups.md). Copying the `/data` volume while the container is stopped still works as a manual backup. A per-user JSON export is available from **Settings** in the app or `GET /api/v1/export` with an API token.

## Audit log

The owner sees an audit log of sign-ins, failed sign-ins, sign-outs, API tokens, invitations, exports and audit setting changes in **Settings → Audit log** (API: [docs/api.md](../api.md#audit-log)). It is stored in `opentodo.db` inside `/data`, so it is part of every backup of the volume, and it never contains task content. Nothing needs configuring:

- **Retention** defaults to 90 days (7–3650, set in Settings). Expired events are pruned at startup, hourly and right after you lower the retention.
- **Client addresses** are not recorded unless you turn on address logging in Settings. Behind a reverse proxy the address is the first `X-Forwarded-For` entry, so make sure the proxy sets that header (Caddy, Traefik and nginx with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` do) and that the container is not reachable around the proxy, or a client could send its own header. Turning address logging off erases every stored address immediately.
- **Disk use** is roughly 200 bytes per event: a household produces a few MB per year; a public server under credential stuffing records one `rate_limited` event per address per minute rather than one per attempt.
- **Export** the log as newline-delimited JSON from the same panel to archive it beyond the retention window.

## Two-factor authentication

Users turn on two-factor authentication in **Settings → Two-factor authentication**. The owner can require it for themselves or for every account there. Nothing needs configuring, but two things are worth knowing:

- **Keep the host clock right.** Codes are checked against the server's own clock with 30 seconds of tolerance either way, so a host that drifts by a minute or more rejects valid codes. Docker uses the host's clock: make sure the host runs NTP (`timedatectl` should report `System clock synchronized: yes`; Raspberry Pi OS and every major distribution do this by default). The enrolment step catches large drift straight away with a "code does not match" message.
- **Owner locked out.** If the owner loses both their authenticator and their recovery codes, reset the second factor from the host while the container is stopped, then sign in with the password and enrol again:

  ```bash
  docker compose stop opentodo
  docker compose run --rm --no-deps opentodo mfa-reset owner@example.com
  docker compose start opentodo
  ```

  The command works only on the data volume (shell access to the host is the proof of ownership), refuses to run while the server holds it, and is recorded as `mfa.reset` in the audit log. Members who are locked out are reset by the owner through `POST /api/v1/members/{id}/mfa/reset` ([docs/api.md](../api.md#two-factor-authentication)).

## Health

`GET /healthz` returns `{"status":"ok","version":"..."}`. The image defines a `HEALTHCHECK` that runs `/opentodo healthcheck`, which works without curl or a shell.

## Resource usage

Idle memory is around 25 MB; the binary is about 12 MB. A Raspberry Pi 3 or any 1 vCPU / 512 MB VPS is plenty.
