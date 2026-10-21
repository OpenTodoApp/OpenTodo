---
title: Running on TrueNAS
summary: Install on TrueNAS Community Edition with Install via YAML (or, once listed, from the Apps catalogue), the settings, dataset permissions, https, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 23
---
# Running OpenTodo on TrueNAS

OpenTodo is one container with one data folder and no required settings. It runs on TrueNAS Community Edition 24.10 and later, which run apps with Docker.

OpenTodo is not in the TrueNAS **Apps** catalogue yet: the app has been prepared for TrueNAS's community train but not accepted. Until it is, install it with **Install via YAML** as below.

## Install with Install via YAML

1. Create a dataset for the data, for example `tank/apps/opentodo` (**Datasets → Add Dataset**, preset **Apps**). Under **Edit Permissions**, make the user and group `apps` (568) its owner, with write access.
2. Open **Apps → Discover Apps**, click the **⋮** menu next to **Custom App** and choose **Install via YAML**.
3. Name the app `opentodo`, paste the following, change the path to your dataset, and click **Save**:

   ```yaml
   services:
     opentodo:
       image: ghcr.io/pixari/opentodo:0.9.0
       user: "568:568"
       restart: unless-stopped
       ports:
         - "30530:8080"
       environment:
         OPENTODO_BASE_URL: ""
         OPENTODO_SETUP_TOKEN: ""
       volumes:
         - /mnt/tank/apps/opentodo:/data
   ```

4. Open `http://<your-truenas-address>:30530`. The first visitor creates the owner account; after that, the owner invites people (sign-up is closed).

The image has a health check of its own (it has no shell, so it runs `/opentodo healthcheck`), and TrueNAS shows the app as healthy once it answers.

## Install from the Apps catalogue

Once OpenTodo is listed: **Apps → Discover Apps**, search for **OpenTodo**, click **Install**, check the settings below and click **Install**. TrueNAS creates the data dataset (ixVolume) and sets its owner for you, and the **Web UI** button opens the app.

| Setting | Default | What it does |
| --- | --- | --- |
| Base URL | empty | Leave empty when you open OpenTodo by the server's address. Behind a reverse proxy, set the https address people open, for example `https://todo.example.com`. |
| Setup Token | empty | Optional, 16+ characters. Set it when the server is reachable from the internet, so a stranger cannot create the owner account first. |
| Allow Sign-up | off | On lets anyone who can reach the server create an account. |
| Trusted Proxies | empty | The reverse proxies whose `X-Forwarded-For` is trusted, or `cloudflare`. Set it only when every request comes through them. |
| Additional Environment Variables | none | Any other `OPENTODO_*` variable from the [configuration table](https://github.com/pixari/opentodo#configuration). |
| User ID / Group ID | 568 / 568 | The user OpenTodo runs as and that owns its files (`apps`). |
| WebUI Port | 30530 | The port on your server. OpenTodo listens on it directly. |
| Data Storage | ixVolume | Where the database, attachments and backups live, mounted on `/data`. Choose **Host Path** to use a dataset of your own. |

## Permissions

The image runs as user 65532 by default, but the binary runs as any user that can write `/data`; both setups above run it as `apps` (568). If the app stops right after it starts and its log mentions the database ("unable to open database file", "readonly database" or "permission denied"), the dataset is not writable for that user: give `apps` ownership of it under **Datasets → Edit Permissions** (or, from the shell, `chown -R 568:568 /mnt/tank/apps/opentodo`).

## https and reverse proxies

On the server's address (`http://192.168.1.10:30530`) tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (Nginx Proxy Manager or Caddy from the Apps catalogue, Traefik) or use Tailscale's https, then set **Base URL** (`OPENTODO_BASE_URL`) to that https address. Keep it empty on plain http: an https Base URL opened over plain http breaks signing in. If the proxy sits behind Cloudflare's proxy, set **Trusted Proxies** to `cloudflare`. More on proxies in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The app names one release (`0.9.0`), never a moving tag. With Install via YAML, change the tag in the app's YAML (**Edit**) to the new release and save; TrueNAS pulls it and restarts the app. From the catalogue, TrueNAS shows **Update** on the app when the catalogue has a new version (its maintainers bump it after each OpenTodo release). Migrations run on start and there are no down-migrations, so back up first.

Everything OpenTodo stores is in its dataset (or ixVolume). Protect it with periodic **snapshots** and **replication** or a **Cloud Sync** task, or turn on scheduled backups in **Settings → Server** (written to `backups/` in the same folder, or to S3 or WebDAV). See [Backups](../backups.md).
