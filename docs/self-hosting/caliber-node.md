---
title: Running on Caliber Node
summary: Run the released image as a Caliber Node "Bring your own app", set the https address, update by pulling stable again, and back up.
audience: admin
specs: [self-hosting]
screens: []
order: 39
---
# Running OpenTodo on Caliber Node

OpenTodo is one container with one data folder and no required settings. [Caliber Node](https://calibernode.com) does not list OpenTodo in its app catalogue yet, but it runs the released image as a custom app. Caliber Node is a paid managed host; OpenTodo is not affiliated with it.

## Deploy

1. In Caliber Node, create a new app with **Bring your own app**.
2. Enter the image `ghcr.io/opentodoapp/opentodo:stable`.
3. Caliber Node sets the port (`8080`) and a persistent volume on `/data` by itself; leave them as they are.
4. Add the environment variable `OPENTODO_BASE_URL` with the app's https address, for example `https://opentodo.example.calibernode.com` (the address Caliber Node shows for the app, or your own domain). Passkeys, secure cookies and links in emails use it.
5. Start the app.

## First visit

Open the app's address. The first visitor creates the owner account; after that, sign-up is closed and the owner invites people. The address is public from the first minute, so either open it right away or also set `OPENTODO_SETUP_TOKEN` to a random value of at least 16 characters before you start the app; the setup screen then asks for it.

Other `OPENTODO_*` variables are in the [configuration table](https://github.com/OpenTodoApp/OpenTodo#configuration).

## Updates

The `stable` tag moves with every release. To update, pull the image again (redeploy or restart the app so Caliber Node pulls `stable`). Migrations run on start and there are no down-migrations, so back up first. To stay on one release line, use `ghcr.io/opentodoapp/opentodo:0.22` (or one version, `0.22.0`) instead of `stable`.

## Data and backups

Everything OpenTodo stores (the database, attachments and its own backups) is on the `/data` volume. For backups off Caliber Node, turn on scheduled backups in OpenTodo's **Settings → Server** with an S3 or WebDAV destination; backups written only to `backups/` stay on the same volume. See [Backups](../backups.md).

## Troubleshooting

- **The log says "permission denied", "readonly database" or "unable to open database file"**: OpenTodo cannot write `/data`. Check that the app's volume is mounted on `/data` and [open an issue](https://github.com/OpenTodoApp/OpenTodo/issues) with the log.
- **Sign-in does not stick, or passkeys fail**: `OPENTODO_BASE_URL` names another address. Set it to the https address you open.
- **Live updates do not arrive**: see [Live updates through the proxy](docker.md#live-updates-through-the-proxy) for the test page.
