---
title: Running on Umbrel
summary: The Umbrel App Store package, the first account, Umbrel login and the routes it lets through, the settings, https, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 30
---
# Running OpenTodo on Umbrel

OpenTodo has a package for the official Umbrel App Store ([`deploy/umbrel/`](https://github.com/pixari/opentodo/tree/main/deploy/umbrel)). It has been submitted ([getumbrel/umbrel-apps#6251](https://github.com/getumbrel/umbrel-apps/pull/6251)) but is not listed yet. Until it is, umbrelOS cannot install it (umbrelOS installs only from app stores); run OpenTodo on another machine with [Docker](docker.md) instead. The rest of this page describes the package as it will be listed.

## Install

Open the **App Store** on your Umbrel, search for **OpenTodo** and click **Install**. Then open it from the home screen (it opens at `http://umbrel.local:8418`). There is no default password: the first person to open OpenTodo creates the owner account, so open it right after installing. After that, sign-up is closed and the owner invites people.

## Umbrel login

Umbrel asks for its own login before it shows OpenTodo. Account creation stays behind that login too, so nobody else on your network can create the owner account before you do. These routes are let through without it, because the clients that use them cannot sign in to Umbrel; OpenTodo checks them itself:

- `/api/…`: API tokens, the browser extension and other clients;
- `/dav` and `/.well-known/caldav`: CalDAV, with an app password;
- `/feeds/…`: calendar feeds, with the secret in their address;
- `/mcp`: MCP clients, with an API token;
- `/public/…`: public list links, read-only, with the secret in their address (and the web app files such a page loads).

**CalDAV on iPhone, iPad and Mac.** Apple's Calendar and Reminders look for the CalDAV service by asking the server's root address first (`PROPFIND /`), and the root is behind Umbrel's login, so automatic discovery ends at the Umbrel login page and the account cannot be added. Enter the full address by hand as the server instead: `https://<your-umbrel-address>/.well-known/caldav`, or the `/dav/` address that **Settings → Integrations → Calendar apps** shows ([client setup](../caldav.md#client-setup)), not just the host name. Turning off **Require Umbrel login** also lets discovery through.

Umbrel's login is one password for the whole device, so people you invite to OpenTodo would need it as well. On umbrelOS 2.0 you can turn off **Require Umbrel login** in OpenTodo's settings on Umbrel; OpenTodo's own login then protects it.

## Settings

All optional, in OpenTodo's settings on Umbrel (umbrelOS 2.0). Changing one restarts the app.

| Setting | Default | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | empty | Leave empty when you open OpenTodo from your Umbrel. Set it only when OpenTodo is reachable at your own https address, for example `https://todo.example.com`, through a tunnel or reverse proxy. An https value while you open it over plain http breaks signing in. |
| `OPENTODO_SETUP_TOKEN` | empty | At least 16 characters. When set, creating the owner account asks for it. Useful when Umbrel login is off and others can reach OpenTodo. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can open OpenTodo create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Reverse proxies whose `X-Forwarded-For` is trusted, such as `cloudflare`. Leave empty unless every request comes through them. |

## https

On Umbrel's http address tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https with a certificate your browser trusts, because browsers only allow them there. Reach OpenTodo through a tunnel or reverse proxy with its own certificate (or Tailscale's https), then set `OPENTODO_BASE_URL` to that address. More on proxies in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates

The package names one release, pinned by its digest, because Umbrel requires that. Umbrel shows an update when a new package version is merged into its App Store, usually shortly after an OpenTodo release (release candidates are never submitted). Update from the App Store; migrations run on start. There are no down-migrations, so back up first.

## Data and backups

Everything OpenTodo stores (the database, attachments and its own backups) is in the app's data folder, `~/umbrel/app-data/opentodo/data` on the Umbrel. umbrelOS backups include it, and the data folder can be moved to another drive in umbrelOS 2.0. You can also turn on scheduled backups in OpenTodo's **Settings → Server** (written to `backups/` in the same folder, or to S3 or WebDAV). See [Backups](../backups.md).

OpenTodo runs as user 1000 there, the owner of Umbrel's app data, so no permission changes are needed.
