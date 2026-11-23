---
title: Running as a Home Assistant add-on
summary: Add OpenTodo's add-on repository to Home Assistant OS or Supervised, install, the options, https, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 38
---
# Running OpenTodo as a Home Assistant add-on

On Home Assistant OS or a Supervised installation, OpenTodo runs as an add-on (Home Assistant now calls add-ons apps) on the same machine. It comes from OpenTodo's own add-on repository, [`OpenTodoApp/opentodo-homeassistant-addons`](https://github.com/OpenTodoApp/opentodo-homeassistant-addons), published from [`deploy/homeassistant/upstream/`](https://github.com/OpenTodoApp/OpenTodo/tree/main/deploy/homeassistant/upstream). Images are built for amd64 and aarch64 (a Raspberry Pi 4 or 5, Home Assistant Green and Yellow).

To see and change your tasks in Home Assistant itself (to-do lists, automations), add the OpenTodo integration too: see [Home Assistant](../home-assistant.md).

**Home Assistant Container or Core?** Those installations have no add-ons. Run OpenTodo with Docker next to Home Assistant instead ([Running with Docker](docker.md)) and connect the integration to it.

## Install

1. In Home Assistant, open **Settings → Apps → App store** (**Settings → Add-ons → Add-on store** on older versions).
2. In the menu (⋮) choose **Repositories**, add `https://github.com/OpenTodoApp/opentodo-homeassistant-addons` and close the dialog.
3. Find **OpenTodo**, click **Install**, then **Start**.
4. Click **Open Web UI**. OpenTodo opens on port 8080 of your Home Assistant machine, for example `http://homeassistant.local:8080`.

There is no default password: the first person to open OpenTodo creates the owner account, so do it right after installing. After that, sign-up is closed and the owner invites people. When the add-on can be reached from the internet, set the **`setup_token`** option first (see Options below), so creating the owner account asks for it.

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

On a plain http address tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. The recipes below give OpenTodo an https address.

## Reach OpenTodo from outside your home

`http://192.168.x.x:8080` and `homeassistant.local` only work on your home network. Pick one way to reach OpenTodo from anywhere:

| | Domain needed | Open ports | Who can reach it |
| --- | --- | --- | --- |
| [Tailscale](#tailscale) | no | none | only your devices with Tailscale |
| [Cloudflare Tunnel](#cloudflare-tunnel) | yes, on Cloudflare DNS | none | anyone with the address |
| [NGINX Proxy Manager and DuckDNS](#nginx-proxy-manager-and-duckdns) | no (a free DuckDNS name) | 80 and 443 | anyone with the address |

Two options matter. **`base_url`** is the https address people open: without it, passkeys are not offered, emailed links (invitations, password resets) are not sent, and the single sign-on redirect address follows whatever is in the browser, which may not match the one registered with your provider. **`trusted_proxies`** says which proxies OpenTodo believes about the visitor's address. Empty trusts proxies on your own network, which covers all three recipes below. A proxy that isn't believed makes every visitor look like the proxy, so they share one per-address limit of 10 failed sign-ins a minute.

### Tailscale

1. Install the **Tailscale** add-on from the add-on store, start it and open its Web UI to sign in to your tailnet.
2. Install the Tailscale app on your phone and sign in to the same tailnet.
3. In the Tailscale admin console, find your Home Assistant machine's name, such as `homeassistant`. With MagicDNS on (the default), open `http://homeassistant:8080` on the phone, or `http://100.x.y.z:8080` with the machine's Tailscale address.

Leave `base_url` and `trusted_proxies` empty: the phone talks to OpenTodo directly, over Tailscale's encrypted connection.

For https (the installed app, passkeys, push), turn on **HTTPS Certificates** in the admin console's DNS page, then serve port 8080 with Tailscale. The add-on's `share_homeassistant` option serves Home Assistant itself, so run this once in the Advanced SSH & Web Terminal add-on (protection mode off):

```sh
docker exec addon_a0d7b954_tailscale /opt/tailscale serve --bg --https=8443 http://127.0.0.1:8080
```

Then set `base_url` to `https://homeassistant.<your-tailnet>.ts.net:8443` (the full name is in the admin console) and open that address from now on. `trusted_proxies` stays empty. If you also share Home Assistant with `share_on_port: 8443`, pick another port here, such as 10000.

### Cloudflare Tunnel

Needs a domain whose DNS is on Cloudflare.

1. Install the community **Cloudflared** add-on and connect it to your Cloudflare account as its documentation says.
2. On its **Configuration** tab, add OpenTodo under `additional_hosts`, with your Home Assistant machine's local address:

   ```yaml
   additional_hosts:
     - hostname: todo.example.com
       service: http://192.168.1.10:8080
   ```

3. Restart the Cloudflared add-on; it creates the DNS record.
4. In OpenTodo's add-on options set `base_url` to `https://todo.example.com`, then restart OpenTodo. `trusted_proxies` can stay empty, since the add-on connects from your own network; `cloudflare` works too.

### NGINX Proxy Manager and DuckDNS

1. Install the **Duck DNS** add-on, create a free name such as `mytodo.duckdns.org` on duckdns.org and put its token and domain in the add-on's options. It keeps the name pointing at your home.
2. On your router, forward ports 80 and 443 to your Home Assistant machine (80 is only for the certificate check).
3. Install the **NGINX Proxy Manager** add-on and open its Web UI. Add a **Proxy Host**: domain `mytodo.duckdns.org`, scheme `http`, forward to your Home Assistant machine's local address, port `8080`. On the **SSL** tab request a new Let's Encrypt certificate and turn on **Force SSL**.
4. In OpenTodo's add-on options set `base_url` to `https://mytodo.duckdns.org` and restart. Leave `trusted_proxies` empty: the proxy runs on your own network, which OpenTodo trusts already.

### Before you expose it

- Create the owner account before opening OpenTodo to the internet, or set `setup_token` first.
- Keep `allow_signup` off and invite people from **Settings → People**.
- Turn on two-factor authentication in **Settings → Account → Security**, and require it for every account there.
- Only ever share the https address. Tailscale is the safest choice: nobody outside your tailnet can reach OpenTodo at all.

## Updates

The add-on's version is the OpenTodo release it runs, such as `0.12.0`. Within a day of a release Home Assistant offers the update on the add-on's page; release candidates are never offered. Migrations run on start and cannot be undone, so keep **Backup before updating** on.

## Data and backups

OpenTodo keeps its database, attachments and secrets in the add-on's own folder. Home Assistant backups include it when the OpenTodo add-on is selected: the add-on stops for a few seconds while it is copied, so the database in the backup is consistent. Restoring the backup, or only the add-on from it, brings back every account and task. Uninstalling the add-on deletes its folder, so take a backup first. OpenTodo's own scheduled backups (**Settings → Server → Backups**) and exports (**Settings → Data**) work too; see [Backups](../backups.md).

## Forgot the owner password

Without outgoing email, get a reset link from the command line. In the Advanced SSH & Web Terminal add-on (protection mode off), run `docker ps` to find the container (`addon_<id>_opentodo`), then `docker exec addon_<id>_opentodo opentodo reset-owner-password` and open the link it prints.
