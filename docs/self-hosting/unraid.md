---
title: Running on Unraid
summary: Install from the Community Applications template, the settings, appdata permissions, https and reverse proxies, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 21
---
# Running OpenTodo on Unraid

OpenTodo is one container with one appdata folder and no required settings. The template ([`opentodo.xml`](https://github.com/pixari/unraid-templates/blob/main/templates/opentodo.xml) in OpenTodo's [template repository](https://github.com/pixari/unraid-templates)) fills in everything.

## Install

Once OpenTodo is listed in **Apps** (Community Applications), search for it and click **Install**. Until then, add the template by hand. In Unraid's terminal (**>_** in the top bar):

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-OpenTodo.xml \
  https://raw.githubusercontent.com/pixari/unraid-templates/main/templates/opentodo.xml
```

Then open **Docker → Add Container**, choose **OpenTodo** under *User templates*, check the settings below and click **Apply**.

Open the **WebUI** from the container's menu. The first visitor creates the owner account; after that, the owner invites people (sign-up is closed).

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Web UI port | `8080` | The port on your server. Change the left side only if 8080 is taken. |
| Data | `/mnt/user/appdata/opentodo` | The database, attachments and backups. Everything OpenTodo stores is here. |
| Base URL | empty | Leave empty when you open OpenTodo by the server's address. Behind a reverse proxy, set the https address people open, for example `https://todo.example.com`. |
| Setup token | empty | Optional, 16+ characters. Set it when the server is reachable from the internet, so a stranger cannot create the owner account first. |

Under **Show more settings**: open sign-up, trusted proxies, push notifications, session length, trash retention, the largest import and the log level. Every other `OPENTODO_*` variable from the [configuration table](https://github.com/pixari/opentodo#configuration) can be added with **Add another Path, Port, Variable…**.

## Permissions

The image runs as user 65532 and has no shell, so it does not use `PUID`, `PGID` or `UMASK`; adding them changes nothing. Unraid's appdata share is writable by everyone by default, which is all it needs. If the container stops right after it starts and its log mentions the database ("unable to open database file", "readonly database" or "permission denied"), the folder is not writable for it. Either give the folder to that user:

```bash
chown -R 65532:65532 /mnt/user/appdata/opentodo
```

or run the container as Unraid's usual `nobody:users`: add `--user 99:100` under **Extra Parameters** (advanced view) and run `chown -R 99:100 /mnt/user/appdata/opentodo`.

## https and reverse proxies

On the server's address (`http://192.168.1.10:8080`) tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (Nginx Proxy Manager, SWAG, Caddy, Traefik) or use Tailscale's https, then set **Base URL** to that https address. If the proxy sits behind Cloudflare's proxy, set **Trusted proxies** to `cloudflare`. More on proxies in [Running with Docker](docker.md).

## Updates and backups

The template follows a release line (`0.6`): **Check for Updates** in the Docker tab installs its patch releases, and migrations run on start. A new line (`0.7`) arrives with an update of the template.

Back up `/mnt/user/appdata/opentodo` with the Appdata Backup plugin, or turn on scheduled backups in **Settings → Server** (they are written to `backups/` in the same folder, or to S3 or WebDAV). See [Backups](../backups.md).

## Troubleshooting

- **The app says Offline and nothing you add is saved** on a plain-http address: OpenTodo 0.6.0 and earlier needed https for this. Update the container.
- **The Web UI link opens the wrong port**: Unraid builds it from the Web UI port; check the left side of that setting.
