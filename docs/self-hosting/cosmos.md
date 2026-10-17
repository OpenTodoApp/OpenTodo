---
title: Running on Cosmos Cloud
summary: Install from the Cosmos market or as a custom compose, the setup token, the address, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 27
---
# Running OpenTodo on Cosmos Cloud

OpenTodo is one container with one volume and no required settings. The servapp ([`cosmos-compose.json`](https://github.com/pixari/opentodo/blob/main/deploy/cosmos/cosmos-compose.json)) sets everything up behind Cosmos's own reverse proxy, with a generated setup token.

## Install

OpenTodo has been prepared for the official Cosmos market but is not listed there yet. Until it is, install it as a custom compose:

1. Copy the contents of [`deploy/cosmos/cosmos-compose.json`](https://raw.githubusercontent.com/pixari/opentodo/main/deploy/cosmos/cosmos-compose.json).
2. In Cosmos open **ServApps**, click **Import Compose File**, paste it and click **Next**.
3. Choose the service name (for example `opentodo`) and the hostname OpenTodo will answer on (for example `todo.example.com`), then install.

Once OpenTodo is listed, open the **Market**, search for **OpenTodo** and click **Install** instead.

When the install finishes, Cosmos shows the address and a **setup token**. Keep the token: open the address, and the setup screen asks for it when you create the owner account. After that the owner invites people (sign-up is closed). The token stays in the container's environment (`OPENTODO_SETUP_TOKEN`) if you need it again.

## What the template sets

| Setting | Value | What it does |
| --- | --- | --- |
| Image | `ghcr.io/pixari/opentodo:stable` | The latest release; see [Updates](#updates-and-backups). |
| Data | volume `<service name>-data` on `/data` | The database, attachments and backups. Everything OpenTodo stores is here. |
| Route | the hostname you chose, to port 8080 | Cosmos serves OpenTodo on that hostname with its certificate; no port is opened on the server. |
| `OPENTODO_BASE_URL` | the route's address | Filled in by Cosmos, with `https` when Cosmos has certificates and `http` when they are turned off. |
| `OPENTODO_SETUP_TOKEN` | a generated 24-character password | Required to create the owner account, so nobody who finds the address first can claim it. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Proxies in front of Cosmos; see below. |

Change or add settings in the ServApp's **Docker** tab, under **Environment variables**; every `OPENTODO_*` variable from the [configuration table](https://github.com/pixari/opentodo#configuration) can be added there.

Cosmos is the reverse proxy in front of OpenTodo, and OpenTodo already takes the visitor's address from it. Set `OPENTODO_TRUSTED_PROXIES` only when another proxy sits in front of Cosmos, for example `cloudflare` when Cloudflare's proxy is on for the hostname, so rate limits and the audit log see visitors rather than that proxy.

## https

With Cosmos's certificates on (the default), OpenTodo is served over https and everything works: installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption. If certificates are turned off in Cosmos, tasks, projects, sync, sharing and attachments still work over plain http, but those features do not, because browsers only allow them on https. Keep `OPENTODO_BASE_URL` equal to the address people really open: an https value while you open OpenTodo over plain http breaks signing in. More on proxies in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The template uses the `stable` image, which every release moves, and turns on Cosmos's automatic updates for it: Cosmos installs each release by itself, and migrations run on start. There are no down-migrations, so keep backups (see below). To choose when to update, turn off **Auto-update** in the ServApp's settings and use **Update** when you are ready. To stay on one release line and take only its fixes, change the image to `ghcr.io/pixari/opentodo:0.6` (or pin one version, `0.6.1`).

Back up the `<service name>-data` volume with Cosmos's backups, or turn on scheduled backups in **Settings → Server** (they are written to `backups/` in the same volume, or to S3 or WebDAV). See [Backups](../backups.md).

## Troubleshooting

- **Cosmos refuses the install** with "This service requires a newer version of Cosmos": the template needs Cosmos 0.22.23 or newer. Update Cosmos.
- **Signing in fails**: `OPENTODO_BASE_URL` does not match the address you open (for example https while certificates are off). Correct it in the **Docker** tab.
