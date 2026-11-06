---
title: Self-hosting handbook
summary: From an empty host to a monitored server you can restore - install, first run, TLS, backups with a restore drill, upgrades, monitoring, hardening and sizing.
audience: admin
specs: [self-hosting]
screens: []
order: 1
---
# Self-hosting handbook

Follow the eight steps in order. Each one is short and links to the page with the details. Nothing has to be configured: every setting is optional ([configuration reference](configuration.md)).

1. [Install](#1-install)
2. [First run](#2-first-run)
3. [Reverse proxy and TLS](#3-reverse-proxy-and-tls)
4. [Backups and a restore drill](#4-backups-and-a-restore-drill)
5. [Upgrading](#5-upgrading)
6. [Monitoring](#6-monitoring)
7. [Hardening](#7-hardening)
8. [Sizing](#8-sizing)

## 1. Install

One image, `ghcr.io/opentodoapp/opentodo` (linux/amd64 and linux/arm64), or one static binary from the [releases](https://github.com/OpenTodoApp/OpenTodo/releases). Pick your platform:

| Platform | Page |
| --- | --- |
| Docker Compose or `docker run` (the reference install) | [Running with Docker](docker.md) |
| Podman with a systemd Quadlet | [Running with Podman](podman.md) |
| Kubernetes (Helm chart) | [Running on Kubernetes](kubernetes.md) |
| Coolify | [Deploying on Coolify](coolify.md) |
| Dokploy | [Running on Dokploy](dokploy.md) |
| Easypanel | [Running on Easypanel](easypanel.md) |
| CapRover | [Running on CapRover](caprover.md) |
| Portainer | [Running on Portainer](portainer.md) |
| Unraid | [Running on Unraid](unraid.md) |
| TrueNAS | [Running on TrueNAS](truenas.md) |
| Synology | [Running on Synology](synology.md) |
| CasaOS and ZimaOS | [Running on CasaOS and ZimaOS](casaos.md) |
| Cosmos Cloud | [Running on Cosmos Cloud](cosmos.md) |
| Runtipi | [Running on Runtipi](runtipi.md) |
| Umbrel | [Running on Umbrel](umbrel.md) |
| Home Assistant OS or Supervised | [Running as a Home Assistant add-on](home-assistant-addon.md) |
| Fly.io | [Running on Fly.io](fly.md) |
| Render | [Running on Render](render.md) |
| Caliber Node | [Running on Caliber Node](caliber-node.md) |
| PikaPods (managed hosting) | [Running on PikaPods](pikapods.md) |

The binary runs anywhere with `OPENTODO_DATA_DIR=/var/lib/opentodo ./opentodo`; see [Single binary](../../README.md#single-binary). Verify the image or the download before you run it: [Verifying the image and downloads](docker.md#verifying-the-image-and-downloads).

## 2. First run

1. Open the server's address. **The first visitor becomes the owner.** On a server reachable from the internet, set `OPENTODO_SETUP_TOKEN` or `OPENTODO_SETUP_CODE=required` before the first start ([The setup code](docker.md#the-setup-code)).
2. Keep sign-up closed and add people with invitations ([Managing users](docker.md#managing-users)).
3. Optional, at any time:
   - [Outgoing email](outgoing-email.md) for password resets and invitations
   - [Single sign-on](sso.md) with your OpenID Connect provider
   - [Branding](branding.md): your own name and logo
   - [Maps](maps.md) for task locations, or turn them off
   - [Speech to text](speech-to-text.md) on your own network

Running a public demo, or a hosted service for many customers, is a different setup: [Public demo instance](demo.md), [Host mode](host-mode.md).

## 3. Reverse proxy and TLS

OpenTodo speaks plain HTTP on port 8080; the proxy terminates TLS. Two settings matter:

- `OPENTODO_BASE_URL=https://todo.example.com`: `Secure` cookies, HSTS, passkeys, web push, emailed links and the origin check all depend on it.
- `OPENTODO_TRUSTED_PROXIES`: only needed when the proxy is not on loopback or a private network, or behind Cloudflare (`cloudflare`).

Live updates use a server-sent event stream (`/api/v1/sync/events`): don't buffer it, and keep idle timeouts above 25 s. Details and troubleshooting: [Behind a reverse proxy](docker.md#behind-a-reverse-proxy).

**Caddy** (certificates are automatic):

```
todo.example.com {
    reverse_proxy opentodo:8080
}
```

**nginx**:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name todo.example.com;
    ssl_certificate     /etc/letsencrypt/live/todo.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/todo.example.com/privkey.pem;
    client_max_body_size 50m;   # imports and attachments

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_buffering off;    # the live-update stream
        proxy_read_timeout 1h;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik** (Docker labels, with a `websecure` entry point and a `letsencrypt` resolver):

```yaml
services:
  opentodo:
    image: ghcr.io/opentodoapp/opentodo:stable
    environment:
      OPENTODO_BASE_URL: https://todo.example.com
    labels:
      - traefik.enable=true
      - traefik.http.routers.opentodo.rule=Host(`todo.example.com`)
      - traefik.http.routers.opentodo.entrypoints=websecure
      - traefik.http.routers.opentodo.tls.certresolver=letsencrypt
      - traefik.http.services.opentodo.loadbalancer.server.port=8080
```

Using CalDAV through the proxy? Pass WebDAV methods and `/.well-known/caldav` through: [Calendar apps through the proxy](docker.md#calendar-apps-caldav-through-the-proxy).

## 4. Backups and a restore drill

Turn on scheduled backups in **Settings → Server → Backups**: snapshots taken while the server runs, to a folder, S3 or WebDAV, optionally encrypted. Keep one destination **off the host**. Everything is in [Backups](../backups.md).

A backup you have never restored is a hope. Run this drill once after setting up, and after every major upgrade. It takes about 10 minutes and never touches the running server.

1. Pick the newest archive from **Settings → Server → Backups** (or `GET /api/v1/backups/archives`) and copy it to the host, for example `./drill.tar.gz`. Make it readable by uid 65532 (`chmod a+r`).
2. Note the task count on the running server, with an API token:

   ```sh
   curl -s -H "Authorization: Bearer $TOKEN" https://todo.example.com/api/v1/tasks | jq '.tasks | length'
   ```

3. Restore into an empty scratch volume (add `--passphrase-file` for an encrypted archive, see [Restore from the command line](../backups.md#restore-from-the-command-line)):

   ```sh
   docker run --rm -v opentodo-drill:/data -v "$PWD/drill.tar.gz:/restore/archive:ro" \
     ghcr.io/opentodoapp/opentodo:stable restore /restore/archive
   ```

4. Start a scratch server on another port and check it:

   ```sh
   docker run -d --name opentodo-drill -v opentodo-drill:/data -p 127.0.0.1:18091:8080 \
     ghcr.io/opentodoapp/opentodo:stable
   curl -s http://127.0.0.1:18091/healthz        # {"status":"ok","version":"…"}
   curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:18091/api/v1/tasks | jq '.tasks | length'
   ```

   The count matches the backup's moment (tasks added since are missing, as expected). The token works because the restore brings back the whole server.
5. Remove the scratch server: `docker rm -f opentodo-drill && docker volume rm opentodo-drill`.

Last run of this drill by the maintainers: 2026-11-06, with 0.22.0 (`/healthz` ok, 3 of 3 tasks restored).

## 5. Upgrading

- **Docker Compose:** `docker compose pull && docker compose up -d`. Each platform page has its own one-line update.
- **Binary:** replace it and restart.

Migrations run at start, and a backup is taken before they do. There are no down-migrations. Any release from 0.1.0 upgrades directly to the latest; read the release's **Upgrade notes** in the [changelog](../../CHANGELOG.md) first. What every 1.x release keeps, and how upgrades are tested: [Stability and compatibility](../stability.md#upgrades). Which image tag follows what: [Updating](docker.md#updating).

## 6. Monitoring

| What | Where |
| --- | --- |
| Health | `GET /healthz` → `{"status":"ok","version":"…"}`; the image's `HEALTHCHECK` runs `/opentodo healthcheck` |
| Logs | stdout, `slog` text lines; `OPENTODO_LOG_LEVEL=debug` adds one line per API request |
| Configuration problems | logged at start, and shown to the owner at the top of **Settings** |
| Backups | **Settings → Server → Backups**: last run, result, next run |
| Disk | the data directory: `opentodo.db`, `attachments/`, `backups/` (local destination), `cache/maps`; **Settings → Server → Backups → Database storage** shows the database and its compaction |
| Security events | **Settings → Server → Audit log**, exportable as NDJSON ([Audit log](docker.md#audit-log)) |

Point your uptime monitor at `/healthz`. It needs no credentials and reveals only the version.

## 7. Hardening

- [ ] `OPENTODO_BASE_URL` is the public https address.
- [ ] The first account was created by you; `OPENTODO_SETUP_TOKEN` or `OPENTODO_SETUP_CODE=required` was set before the first start on a public address.
- [ ] Sign-up is closed (`OPENTODO_ALLOW_SIGNUP` unset); people join by invitation.
- [ ] Two-factor authentication is required for the owner, or for every account: **Settings → People → Access policies** ([Two-factor authentication](docker.md#two-factor-authentication)).
- [ ] Single sign-on, if you have a provider, with a break-glass owner password ([Single sign-on](sso.md)).
- [ ] API tokens have the narrowest scope (`read`, `agent`); `admin` tokens only where a script needs them ([API tokens](../api.md#authentication)).
- [ ] Private network targets for webhooks stay off unless you need them ([Webhooks](../webhooks.md#private-network-protection)).
- [ ] `OPENTODO_DEMO` is unset.
- [ ] Backups run to an off-site destination, encrypted, and the restore drill passed.
- [ ] The server is behind the proxy only: publish the port on `127.0.0.1` (`OPENTODO_BIND=127.0.0.1` with Docker Compose).
- [ ] The host's kernel and clock are kept up to date ([Host kernel](docker.md#host-kernel)).

What the server defends and what it does not: [Security](../security/README.md) and the [threat model](../security/threat-model.md).

## 8. Sizing

The budgets of a 10,000-task account ([Performance budgets](../performance.md#the-server)). The CI server's limits are checked every night; the Raspberry Pi 4 column is the target for a real Pi, which was not measured for 1.0 and will be after it ([#990](https://github.com/OpenTodoApp/OpenTodo/issues/990)).

| | CI server | Raspberry Pi 4 (4 GB) |
| --- | --- | --- |
| Memory when idle | under 60 MB | under 240 MB |
| Peak memory, a device's first sync | under 150 MB | under 600 MB |
| Peak memory, full JSON export | under 200 MB | under 800 MB |
| Database file | under 150 MB | under 150 MB |
| Database with a year of note history, after compaction | under 250 MB | under 250 MB |
| Start to healthy | under 2 s | under 8 s |

A household runs comfortably on a Raspberry Pi 3 or a 1 vCPU / 512 MB VPS: a fresh server idles at about 20 MB. Plan disk for the database, attachments (25 MB per file and 1 GB per account by default, set in **Settings → Server → Attachments**) and local backups.
