---
title: Running with Podman
summary: Run OpenTodo as a systemd service with a Podman Quadlet, rootful or rootless, automatic updates, the data volume and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 33
---
# Running OpenTodo with Podman

A Quadlet is a small systemd unit that Podman turns into a service. OpenTodo's has two files: [`opentodo.container`](https://github.com/pixari/opentodo/blob/main/deploy/podman/opentodo.container) (the container) and [`opentodo.volume`](https://github.com/pixari/opentodo/blob/main/deploy/podman/opentodo.volume) (its data). You need Podman 4.6 or later with systemd; check with `podman --version`. Fedora, RHEL 9.3 or later and its rebuilds, CentOS Stream 9, openSUSE Tumbleweed, Debian 13 and Ubuntu 24.04 ship a new enough Podman. Debian 12 and Ubuntu 22.04 do not.

## Install as root

```bash
cd /etc/containers/systemd
sudo curl -fsSLO https://raw.githubusercontent.com/pixari/opentodo/main/deploy/podman/opentodo.container
sudo curl -fsSLO https://raw.githubusercontent.com/pixari/opentodo/main/deploy/podman/opentodo.volume
sudo systemctl daemon-reload
sudo systemctl start opentodo
```

Create `/etc/containers/systemd` first if it does not exist. The service starts at boot by itself: Podman applies the file's `[Install]` section, so there is no `systemctl enable` step (it would fail).

## Install as your user (rootless)

```bash
mkdir -p ~/.config/containers/systemd
cd ~/.config/containers/systemd
curl -fsSLO https://raw.githubusercontent.com/pixari/opentodo/main/deploy/podman/opentodo.container
curl -fsSLO https://raw.githubusercontent.com/pixari/opentodo/main/deploy/podman/opentodo.volume
systemctl --user daemon-reload
systemctl --user start opentodo
sudo loginctl enable-linger "$USER"
```

`enable-linger` keeps your services running after you log out and starts them at boot.

Inside the container OpenTodo runs as user 65532. Rootless Podman maps that to one of your subordinate user IDs, so your user needs a range in `/etc/subuid` and `/etc/subgid` (`useradd` creates one of 65536 IDs; check with `grep "$USER" /etc/subuid`). The named volume is created owned by that user on first start, so it needs no options. If you replace it with a folder of your own, add `:U` so Podman gives the folder to the container's user, and on Fedora and RHEL also `Z` for SELinux:

```ini
Volume=%h/opentodo-data:/data:U,Z
```

## First visit

Open `http://<your-host>:8080`. The first visitor creates the owner account; after that, sign-up is closed and the owner invites people. If the server can be reached from the internet before you open it, set a setup token first (below).

## Settings

The settings are the `Environment=` lines in `opentodo.container`:

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | empty | The https address people open, for example `https://todo.example.com`. Leave it empty on plain http. |
| `OPENTODO_SETUP_TOKEN` | empty | Optional, 16+ characters (for example from `openssl rand -hex 16`). Creating the owner account then asks for it. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Reverse proxies whose `X-Forwarded-For` is trusted, or `cloudflare`. Set it only when every request comes through them. |

Add any other variable from the [configuration table](https://github.com/pixari/opentodo#configuration) as another `Environment=NAME=value` line. To use another host port, change the left side of `PublishPort=8080:8080`. After editing, run `systemctl daemon-reload` and `systemctl restart opentodo` (with `sudo`, or `--user` when rootless).

## https and reverse proxies

On `http://<your-host>:8080`, tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (Caddy, nginx, Traefik) or use Tailscale's https, set `OPENTODO_BASE_URL` to that address, and change the port to `PublishPort=127.0.0.1:8080:8080` so only the proxy reaches it. Never set an `https://` address while you open OpenTodo over plain http: the session cookie becomes secure-only and sign-in fails. More in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The unit uses the `stable` image, which every release moves, and `AutoUpdate=registry`. `podman auto-update` checks the registry, pulls a new `stable` and restarts the service; if the new container does not start, it goes back to the previous image. Run it by hand, or turn on Podman's daily timer:

```bash
sudo systemctl enable --now podman-auto-update.timer        # as root
systemctl --user enable --now podman-auto-update.timer      # rootless
```

`podman auto-update --dry-run` shows what would change. Migrations run on start and there are no down-migrations, so keep backups. To stay on one release line, change the image to `ghcr.io/pixari/opentodo:0.9` (its fixes only) or pin one version, `0.9.0`.

Everything OpenTodo stores is in the volume `systemd-opentodo`; `podman volume inspect systemd-opentodo` shows where it is on disk. Turn on scheduled backups in OpenTodo's **Settings → Server** (written to `backups/` in the same volume, or to S3 or WebDAV), or stop the service and run `podman volume export systemd-opentodo --output opentodo-data.tar`. See [Backups](../backups.md).

## Troubleshooting

- **`systemctl start` says the unit was not found**: Podman could not read the file. `/usr/libexec/podman/quadlet -dryrun` (add `-user` for rootless; some distributions keep it in `/usr/lib/podman/`) prints the error.
- **Logs**: `journalctl -u opentodo` (`journalctl --user -u opentodo` when rootless). `podman healthcheck run opentodo` runs the health check once.
- **The container stops with "permission denied" on `/data`**: a folder of your own is mounted without `:U`.
- **Sign-in does not stick**: `OPENTODO_BASE_URL` is https but you open OpenTodo over plain http. Clear it and restart.
