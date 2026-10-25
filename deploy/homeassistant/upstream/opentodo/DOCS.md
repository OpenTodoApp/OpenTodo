# Home Assistant add-on: OpenTodo

OpenTodo is an open-source, local-first task manager. This add-on runs the OpenTodo server on your Home Assistant machine; you use it from a browser or install it as an app on your phone and computer.

## Installation

1. Install the add-on and start it. Leave the options as they are for now.
2. Click **Open Web UI**. It opens OpenTodo on port 8080 of your Home Assistant machine, for example `http://homeassistant.local:8080`.
3. The first person to open it creates the owner account, so do it right away. After that, sign-up is closed and the owner invites people from **Settings → People**. Opened from outside your local network, the setup screen asks for a one-time setup code, printed on the add-on's **Log** tab.

OpenTodo opens in its own browser tab, not in the Home Assistant sidebar: it has its own accounts and works as an app on your devices, which a page inside Home Assistant cannot do (see "Why not in the sidebar" below).

## Options

All options are optional.

| Option | Default | What it does |
| --- | --- | --- |
| `base_url` | empty | The address people open, for example `https://todo.example.com`. Needed behind a reverse proxy for passkeys, secure cookies and links in emails. Include the port if there is one. Leave it empty when you open OpenTodo by the machine's address. |
| `setup_token` | empty | At least 16 characters. When set, creating the owner account asks for this token, so a server reachable from the internet cannot be claimed by a stranger. |
| `allow_signup` | off | Lets anyone who can reach OpenTodo create an account. Otherwise the owner invites people. |
| `trusted_proxies` | empty | Reverse proxies whose `X-Forwarded-For` is trusted for the visitor's address: IP addresses or ranges such as `192.0.2.0/24` separated by commas, or `cloudflare`. Set it only when every request comes through them. |
| `log_level` | `info` | `debug`, `info`, `warn` or `error`. The add-on's **Log** tab shows the level in use on its first line; `debug` adds one line per request. |

Example, with OpenTodo published on its own domain through a reverse proxy at `192.168.1.2`:

```yaml
base_url: https://todo.example.com
setup_token: a-long-random-phrase-only-you-know
allow_signup: false
trusted_proxies: 192.168.1.2
log_level: info
```

Restart the add-on after changing an option. Every other setting (email, push notifications, single sign-on, backups to another place, maps) is in OpenTodo's own **Settings**, as the owner.

## Network

OpenTodo listens on port 8080. Change the host port under **Network** if 8080 is taken on your machine.

On a plain http address (`http://homeassistant.local:8080`) tasks, projects, sync, sharing and attachments work. Installing OpenTodo as an app, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (for example the NGINX Proxy Manager add-on, or Cloudflare Tunnel), give it its own address such as `https://todo.example.com`, and set `base_url` to it. The https address is the one your devices keep using.

### Why not in the sidebar

Home Assistant's sidebar panels (Ingress) show an add-on under a changing address inside Home Assistant's own, and reach it through your Home Assistant sign-in. OpenTodo expects to be served at the root of its own address: its pages, its API and its offline service worker live there, and passkeys and the installed apps are tied to that address. Under Ingress the page stays blank. Open it on its own port or domain instead; you can still add a sidebar link to that address with a Webpage dashboard.

## Data and backups

OpenTodo keeps its database, attachments and secrets in the add-on's own folder (`/data` inside the add-on). Home Assistant's backups include it when the OpenTodo add-on is selected; the add-on stops for a moment while it is backed up, so the copy of the database is consistent. Restoring that backup brings back every account and task. Uninstalling the add-on deletes the folder, so take a backup first.

OpenTodo also has its own backups (**Settings → Server**: scheduled snapshots, downloadable archives, copies to S3 or WebDAV) and export, if you want copies outside Home Assistant.

## Updates

Each add-on version runs one OpenTodo release; the version is the same, such as `0.12.0`. When OpenTodo publishes a release, the add-on gets the same version within a day and Home Assistant offers the update. Database changes run on start and cannot be undone, so let Home Assistant take a backup when it updates (the default). Release candidates are never offered.

## Forgot the owner password

Without email set up, the owner can get a reset link from the command line: with the Advanced SSH & Web Terminal add-on (protection mode off) run `docker exec addon_<id>_opentodo opentodo reset-owner-password` and open the link it prints. The add-on's name in `docker ps` shows the exact container name.

## Help and source

- Documentation: <https://open-todo.app/docs/self-hosting/home-assistant-addon/>
- Questions and bugs: <https://github.com/pixari/opentodo/issues>
- The add-on's source: <https://github.com/pixari/opentodo-homeassistant-addons>

OpenTodo and this add-on are licensed under the GNU Affero General Public License v3.0.
