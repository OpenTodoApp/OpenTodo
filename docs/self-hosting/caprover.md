---
title: Running on CapRover
summary: Install the one-click app (or paste it as a template), the setup token, turning on https and then the base URL, the volume, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 34
---
# Running OpenTodo on CapRover

OpenTodo is one container with one volume and no required settings. The one-click app sets up the container, the volume and a generated setup token for the owner account.

## Install

OpenTodo is not in CapRover's one-click list yet. Until it is, paste it as a template:

1. In the CapRover dashboard, open **Apps → One-Click Apps/Databases**.
2. At the end of the list, choose **>> TEMPLATE <<**.
3. Paste the content of [`opentodo.yml`](https://raw.githubusercontent.com/pixari/opentodo/main/deploy/caprover/opentodo.yml) and click **Next**.
4. Give the app a name, for example `todo`, check the fields below and click **Deploy**.

When it is done, CapRover shows a message with the address and the setup token. Copy the token.

## First visit

Open `http://<app name>.<your root domain>`. The first visitor creates the owner account, and the setup screen asks for the setup token from the message. If you lost it, it is under the app's **App Configs** as `OPENTODO_SETUP_TOKEN`. After that, sign-up is closed and the owner invites people.

## Settings

| Field | Default | What it does |
| --- | --- | --- |
| OpenTodo version | the latest release, for example `0.9.0` | The image tag of `ghcr.io/pixari/opentodo`. |
| Base URL | empty | The https address people open. Leave it empty until https is on (see below). |
| Setup token | generated, 32 characters | Asked for when the owner account is created, so a stranger cannot claim a new server first. |
| Open sign-up | `false` | `true` lets anyone who can reach the server create an account. |
| Trusted proxies | empty | Set it to `cloudflare` when the domain is proxied by Cloudflare. CapRover's own proxy needs nothing here. |

The fields become environment variables of the app. Change them later under **App Configs → Environmental Variables** and click **Save & Update**. Other `OPENTODO_*` variables from the [configuration table](https://github.com/pixari/opentodo#configuration) can be added there too.

## https and the base URL

CapRover serves a new app over plain http. On it, tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there.

Keep the base URL empty on plain http. An `https://` value there makes the session cookie secure-only, so the browser drops it and you cannot sign in.

To turn on https:

1. Open the app's **HTTP Settings** and click **Enable HTTPS** (CapRover gets a Let's Encrypt certificate; if it asks, enable HTTPS for the root domain on the dashboard first). To use your own domain, add it there first and enable HTTPS for it.
2. Turn on **Force HTTPS by redirecting all HTTP traffic to HTTPS** and save.
3. Under **App Configs**, set `OPENTODO_BASE_URL` to the https address, for example `https://todo.captain.example.com`, and click **Save & Update**.

More on proxies and https in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Data and permissions

Everything OpenTodo stores (the database, attachments and its own backups) is in the Docker volume `<app name>-data`, on the server at `/var/lib/docker/volumes/<app name>-data/_data`. CapRover keeps an app with a volume on one server and at one instance; keep it at one.

The image runs as user 65532. A new named volume takes the owner from the image, so it works as installed. If you change the persistent directory to a **host path**, give that folder to the same user before you save, or the container stops with "permission denied" in its log:

```bash
chown -R 65532:65532 /path/on/the/server
```

## Updates and backups

The version field picks one release, and CapRover never updates an installed app by itself. To update, open the app's **Deployment** tab and, under **Deploy via ImageName**, enter the new version, for example `ghcr.io/pixari/opentodo:0.9.0`, then deploy. CapRover pulls the image you name each time you deploy, so entering `ghcr.io/pixari/opentodo:stable` instead gets the current release whenever you deploy it again. Migrations run on start. There are no down-migrations, so back up first. Releases are listed on [GitHub](https://github.com/pixari/opentodo/releases).

Back up the volume folder above with your server's backups, or turn on scheduled backups in OpenTodo's **Settings → Server** (they are written to `backups/` in the same volume, or to S3 or WebDAV). See [Backups](../backups.md).

## Troubleshooting

- **Sign-in does not stick**: `OPENTODO_BASE_URL` starts with `https://` but the app is still served over plain http. Empty it, or turn on HTTPS, then **Save & Update**.
- **The setup screen says the token is wrong**: copy `OPENTODO_SETUP_TOKEN` from **App Configs** again.
- **The app shows CapRover's "nothing here yet" page or a 502**: open the app's **Deployment** tab and check the log. "permission denied" on `/data` means a host path that is not owned by 65532 (see above).
