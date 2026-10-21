---
title: Running on CasaOS and ZimaOS
summary: Install from the app store or as a custom app, the settings, the data folder, https, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 26
---
# Running OpenTodo on CasaOS and ZimaOS

OpenTodo is one container with one data folder and no required settings. The app definition ([`docker-compose.yml`](https://github.com/pixari/opentodo/blob/main/deploy/casaos/docker-compose.yml)) fills in everything.

## Install

OpenTodo has been prepared for the CasaOS / ZimaOS app store but is not listed there yet. Until it is, install it as a custom app:

1. Download [`deploy/casaos/docker-compose.yml`](https://raw.githubusercontent.com/pixari/opentodo/main/deploy/casaos/docker-compose.yml).
2. In the dashboard open the **App Store**, choose **Custom Install** (the **+** at the top right), then **Import** and pick the file (or paste its contents).
3. Check the settings below and click **Install**.

Once OpenTodo is listed, search the **App Store** for **OpenTodo** and click **Install** instead.

Open OpenTodo from its icon on the dashboard (port 8418). The first visitor creates the owner account; after that, the owner invites people (sign-up is closed).

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Port | `8418` | The port on your server. Change it only if 8418 is taken. |
| `/data` | `/DATA/AppData/opentodo/data` (`$AppID` in the app definition is the app's name) | The database, attachments and backups. Everything OpenTodo stores is here. |
| `OPENTODO_BASE_URL` | empty | Leave empty when you open OpenTodo by the server's address. Behind a reverse proxy, set the https address people open, for example `https://todo.example.com`. |
| `OPENTODO_SETUP_TOKEN` | empty | Optional, 16+ characters. Set it when the server can be reached from the internet, so a stranger cannot create the owner account first. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Proxies in front of your reverse proxy, such as `cloudflare`; set it only when every request comes through them. |

Every other `OPENTODO_*` variable from the [configuration table](https://github.com/pixari/opentodo#configuration) can be added in the app's settings under **Environment variables**.

The app also has a small helper container, `opentodo-init`, that runs when the app is installed or started from the dashboard. Docker creates the data folder owned by root, and OpenTodo runs as user 65532, so the helper hands the folder to that user and exits. It shows as stopped; that is expected.

## https and reverse proxies

On the server's address (`http://192.168.1.10:8418`) tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (Nginx Proxy Manager, Caddy, Traefik) or use Tailscale's https, then set `OPENTODO_BASE_URL` to that https address. Keep `OPENTODO_BASE_URL` empty while you open OpenTodo over plain http: an https value there breaks signing in. More on proxies in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The app store does not follow moving image tags: the app names one release (for example `ghcr.io/pixari/opentodo:0.9.0`), and the store offers an update once its entry moves to the next release (OpenTodo's maintainers send that change to the store after each release). Migrations run on start and there are no down-migrations, so back up first (see below). A custom install stays on the release it was installed with; to update it, edit the app, change the image tag to the new version and save.

Back up `/DATA/AppData/opentodo/data` with your usual backup tool (stop the app first for a consistent copy), or turn on scheduled backups in **Settings → Server** (they are written to `backups/` in the same folder, or to S3 or WebDAV). See [Backups](../backups.md).

## Troubleshooting

- **The app stops right after it starts** and its log says "permission denied": the data folder is not writable for user 65532. Start the app from the dashboard so the `opentodo-init` helper runs, or run `sudo chown -R 65532:65532 /DATA/AppData/opentodo/data`.
- **Signing in fails on a plain-http address**: `OPENTODO_BASE_URL` holds an https address. Clear it, or open OpenTodo at that https address.
