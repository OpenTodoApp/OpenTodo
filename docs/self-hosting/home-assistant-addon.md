---
title: Running as a Home Assistant add-on
summary: Add OpenTodo's add-on repository to Home Assistant OS or Supervised, install, the options, https, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 38
---
# Running OpenTodo as a Home Assistant add-on

On Home Assistant OS or a Supervised installation, OpenTodo runs as an add-on (Home Assistant now calls add-ons apps) on the same machine. It comes from OpenTodo's own add-on repository, [`pixari/opentodo-homeassistant-addons`](https://github.com/pixari/opentodo-homeassistant-addons), published from [`deploy/homeassistant/upstream/`](https://github.com/pixari/opentodo/tree/main/deploy/homeassistant/upstream). Images are built for amd64 and aarch64 (a Raspberry Pi 4 or 5, Home Assistant Green and Yellow).

To see and change your tasks in Home Assistant itself (to-do lists, automations), add the OpenTodo integration too: see [Home Assistant](../home-assistant.md).

**Home Assistant Container or Core?** Those installations have no add-ons. Run OpenTodo with Docker next to Home Assistant instead ([Running with Docker](docker.md)) and connect the integration to it.

## Install

1. In Home Assistant, open **Settings → Apps → App store** (**Settings → Add-ons → Add-on store** on older versions).
2. In the menu (⋮) choose **Repositories**, add `https://github.com/pixari/opentodo-homeassistant-addons` and close the dialog.
3. Find **OpenTodo**, click **Install**, then **Start**.
4. Click **Open Web UI**. OpenTodo opens on port 8080 of your Home Assistant machine, for example `http://homeassistant.local:8080`.

There is no default password: the first person to open OpenTodo creates the owner account, so do it right after installing. After that, sign-up is closed and the owner invites people. Opened from outside your local network, the setup screen asks for a one-time setup code, printed on the add-on's **Log** tab.

OpenTodo opens in its own tab, not as a panel in Home Assistant's sidebar. Sidebar panels (Ingress) serve an add-on under a changing address inside Home Assistant's own, and OpenTodo needs the root of its own address for its pages, its offline service worker, passkeys and the installed app. You can still add a sidebar link with a Webpage dashboard.

## Options

All optional, on the add-on's **Configuration** tab. Restart the add-on after a change.

| Option | Default | What it does |
| --- | --- | --- |
| `base_url` | empty | The https address people open, for example `https://todo.example.com`. Set it when OpenTodo is behind a reverse proxy. Leave it empty when you open OpenTodo by the machine's address. |
| `setup_token` | empty | At least 16 characters. When set, creating the owner account asks for it, so a stranger cannot claim a server reachable from the internet. |
| `allow_signup` | off | Lets anyone who can reach OpenTodo create an account. |
| `trusted_proxies` | empty | Reverse proxies whose `X-Forwarded-For` is trusted, such as `192.168.1.2` or `cloudflare`. Set it only when every request comes through them. |
| `log_level` | `info` | `debug`, `info`, `warn` or `error`, shown on the **Log** tab. |

Everything else (email, push notifications, single sign-on, maps) is in OpenTodo's own **Settings**. The host port is on the **Network** section of the same tab, if 8080 is taken.

## https

On a plain http address tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Give OpenTodo its own https address with a reverse proxy (the NGINX Proxy Manager add-on, Caddy, or a Cloudflare Tunnel) pointing at port 8080, set `base_url` to it, and set `trusted_proxies` to the proxy. More in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates

The add-on's version is the OpenTodo release it runs, such as `0.12.0`. Within a day of a release Home Assistant offers the update on the add-on's page; release candidates are never offered. Migrations run on start and cannot be undone, so keep **Backup before updating** on.

## Data and backups

OpenTodo keeps its database, attachments and secrets in the add-on's own folder. Home Assistant backups include it when the OpenTodo add-on is selected: the add-on stops for a few seconds while it is copied, so the database in the backup is consistent. Restoring the backup, or only the add-on from it, brings back every account and task. Uninstalling the add-on deletes its folder, so take a backup first. OpenTodo's own scheduled backups and exports (**Settings → Server**) work too; see [Backups](../backups.md).

## Forgot the owner password

Without outgoing email, get a reset link from the command line. In the Advanced SSH & Web Terminal add-on (protection mode off), run `docker ps` to find the container (`addon_<id>_opentodo`), then `docker exec addon_<id>_opentodo opentodo reset-owner-password` and open the link it prints.
