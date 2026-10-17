---
title: Running on Unraid
summary: Install from Community Applications (Apps), the settings, appdata permissions, https and reverse proxies, Tailscale, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 21
---
# Running OpenTodo on Unraid

OpenTodo is one container with one appdata folder and no required settings. The template ([`opentodo.xml`](https://github.com/pixari/opentodo-unraid/blob/main/templates/opentodo.xml) in OpenTodo's [template repository](https://github.com/pixari/opentodo-unraid)) fills in everything.

## Install

OpenTodo is listed in Community Applications. Open the **Apps** tab, search for **OpenTodo**, click **Install**, check the settings below and click **Apply**.

Without the Apps tab (Community Applications not installed), add the template by hand. In Unraid's terminal (**>_** in the top bar):

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-OpenTodo.xml \
  https://raw.githubusercontent.com/pixari/opentodo-unraid/main/templates/opentodo.xml
```

Then open **Docker → Add Container**, choose **OpenTodo** under *User templates* and continue as above.

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

On the server's address (`http://192.168.1.10:8080`) tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (Nginx Proxy Manager, SWAG, Caddy, Traefik) or use [Tailscale Serve on the Unraid server](#tailscale), then set **Base URL** to that https address. If the proxy sits behind Cloudflare's proxy, set **Trusted proxies** to `cloudflare`. More on proxies in [Running with Docker](docker.md).

## Tailscale

Leave the container's **Use Tailscale** switch off. Unraid adds Tailscale to a container by running a shell script inside it that installs packages and downloads Tailscale at every start; the OpenTodo image has no shell and no package manager (it is built that way to stay small and hard to attack), so with the switch on the container does not start and its log shows `exec /opt/unraid/tailscale: no such file or directory`.

Use Tailscale on the Unraid server itself instead. It gives OpenTodo an https address on your tailnet, with a certificate, without changing the container:

1. Install and sign in to Tailscale on Unraid (see [Unraid's Tailscale guide](https://docs.unraid.net/unraid-os/system-administration/secure-your-server/tailscale/)). In the Tailscale admin console, under **DNS**, turn on MagicDNS and **HTTPS Certificates**.
2. In Unraid's terminal (**>_** in the top bar), publish the container's Web UI port (here `8080`; use the left side of your **Web UI port** setting) on the tailnet over https:

   ```bash
   tailscale serve --bg --https=8443 http://localhost:8080
   ```

   The command prints the address, for example `https://tower.example-tailnet.ts.net:8443`. It stays on after a restart; `tailscale serve --https=8443 off` removes it. Port `8443` keeps Unraid's own web interface free; any free port works.
3. Set **Base URL** to that address (`https://tower.example-tailnet.ts.net:8443`) and apply.

Open OpenTodo at that address from every device on your tailnet. Installing the app, push notifications, passkeys and end-to-end encryption then work. With **Base URL** set, open OpenTodo only at that address: from newer releases on, a page opened at another address (the server's LAN address, say) cannot sign in.

## Updates and backups

The template uses the `stable` image, which every release moves: **Check for Updates** in the Docker tab shows each new release, **Update** installs it, and migrations run on start. There are no down-migrations, so back up the appdata folder first (see below). To stay on one release line and take only its fixes, change **Repository** to `ghcr.io/pixari/opentodo:0.6` (or pin one version, `0.6.1`) in the container's settings.

Back up `/mnt/user/appdata/opentodo` with the Appdata Backup plugin, or turn on scheduled backups in **Settings → Server** (they are written to `backups/` in the same folder, or to S3 or WebDAV). See [Backups](../backups.md).

## Troubleshooting

- **The app says Offline and nothing you add is saved** on a plain-http address: OpenTodo 0.6.0 and earlier needed https for this. Update the container.
- **The Web UI link opens the wrong port**: Unraid builds it from the Web UI port; check the left side of that setting.
- **The container does not start and its log says `exec /opt/unraid/tailscale: no such file or directory`**: the container's **Use Tailscale** switch is on. Turn it off and use [Tailscale on the Unraid server](#tailscale) instead.
