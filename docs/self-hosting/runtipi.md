---
title: Running on Runtipi
summary: Add OpenTodo's app store to Runtipi, install, the settings, the data folder, https, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 31
---
# Running OpenTodo on Runtipi

Runtipi's own app store no longer takes new apps, so OpenTodo has its own app store for Runtipi: [`pixari/opentodo-runtipi`](https://github.com/pixari/opentodo-runtipi), published from [`deploy/runtipi/upstream/`](https://github.com/pixari/opentodo/tree/main/deploy/runtipi/upstream). It holds one app, OpenTodo, with no required settings. Runtipi 4.7.0 or newer is needed.

## Install

1. In Runtipi, open **Settings**, then **App Stores → Add App Store**.
2. Paste `https://github.com/pixari/opentodo-runtipi` and give it a name, for example `opentodo`.
3. Open the app store, choose **OpenTodo** and click **Install**. Leave the settings empty unless you need one (below).

Open OpenTodo from its page in Runtipi (by default on port 8400). There is no default password: the first person to open it creates the owner account, so open it right after installing. After that, sign-up is closed and the owner invites people.

## Settings

All optional; change them later under the app's **Settings** in Runtipi.

| Setting | Default | What it does |
| --- | --- | --- |
| Base URL | empty | The https address people open, for example `https://todo.example.com`. Set it when you expose OpenTodo with a domain. Leave it empty when you open OpenTodo by the server's address: an https value over plain http breaks signing in. |
| Setup token | empty | At least 16 characters. When set, creating the owner account asks for it, so a stranger cannot claim a server reachable from the internet. |
| Open sign-up | off | Lets anyone who can reach the server create an account. |
| Trusted proxies | empty | Reverse proxies whose `X-Forwarded-For` is trusted, such as `cloudflare`. Set it only when every request comes through them. |

## https

On a plain http address (`http://192.168.1.10:8400`) tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Expose OpenTodo with a domain in Runtipi (it gets a certificate through Runtipi's Traefik) and set **Base URL** to that https address. More on proxies in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates

The app names one release (`ghcr.io/pixari/opentodo:0.9.0`), not a moving tag. After each release the store repository gets an update with the new version; Runtipi shows it on the app once it refreshes its app stores (**Settings → Update App Stores** does it right away). Click **Update**; migrations run on start. There are no down-migrations, so back up first. Release candidates are never offered.

## Data and backups

Everything OpenTodo stores (the database, attachments and its own backups) is in `app-data/<store name>/opentodo/data` inside the Runtipi folder. A small helper container gives that folder to the user OpenTodo runs as (65532) before each start, because Runtipi creates it owned by root.

Back it up with Runtipi's app backup (the app's **Backups** tab), with your usual backup tool (stop the app first for a consistent copy), or turn on scheduled backups in OpenTodo's **Settings → Server** (written to `backups/` in the same folder, or to S3 or WebDAV). See [Backups](../backups.md).
