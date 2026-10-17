---
title: Running on Fly.io
summary: Launch from the fly.toml in the repository, the setup token as a secret, the base URL, one always-on machine with a volume, updates, backups and your own domain.
audience: admin
specs: [self-hosting]
screens: []
order: 35
---
# Running OpenTodo on Fly.io

OpenTodo runs on Fly.io as one machine with one volume, served over https at `https://<app>.fly.dev`. The repository has a ready [`fly.toml`](https://github.com/pixari/opentodo/blob/main/deploy/fly/fly.toml); you need a Fly account and [`flyctl`](https://fly.io/docs/flyctl/install/), signed in with `fly auth login`.

## Install

1. Get the configuration into an empty folder:

   ```bash
   mkdir opentodo && cd opentodo
   curl -fsSLO https://raw.githubusercontent.com/pixari/opentodo/main/deploy/fly/fly.toml
   ```

2. Create the app from it. Pick a name (it becomes `<app>.fly.dev`) and a region near you (`fly platform regions` lists them):

   ```bash
   fly launch --copy-config --no-deploy --name <app> --region <region>
   ```

   This creates the app and writes its name and region into `fly.toml`. It does not deploy yet.

3. Set the base URL in `fly.toml`, under `[env]`, to the app's address:

   ```toml
   OPENTODO_BASE_URL = "https://<app>.fly.dev"
   ```

4. Set a setup token, a secret only you know (at least 16 characters):

   ```bash
   fly secrets set OPENTODO_SETUP_TOKEN=$(openssl rand -hex 16)
   fly secrets list   # shows that it is set, not its value
   ```

   Keep the value: you need it once, to create the owner account.

5. Deploy:

   ```bash
   fly deploy
   ```

   The first deploy creates the volume `opentodo_data` (1 GB) and one machine.

## First visit

Open `https://<app>.fly.dev`. The first visitor creates the owner account, and the setup screen asks for the setup token. After that, sign-up is closed and the owner invites people.

Fly serves the app over https only, so installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption all work once the base URL is set.

## Settings

| Setting | In `fly.toml` | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | empty until step 3 | The https address people open. Set it to `https://<app>.fly.dev`, or to your own domain (below). |
| `OPENTODO_SETUP_TOKEN` | not in the file | A secret (`fly secrets set`). Asked for when the owner account is created. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Fly's proxy needs nothing here. Set it to `cloudflare` only if you put Cloudflare's proxy in front of your own domain. |

Other `OPENTODO_*` variables from the [configuration table](https://github.com/pixari/opentodo#configuration) go under `[env]`, or `fly secrets set` for passwords (for example `OPENTODO_EMAIL_IMAP_PASSWORD`). Run `fly deploy` after editing `fly.toml`; `fly secrets set` restarts the machine by itself.

## One machine, always on

Keep exactly one machine. The database is SQLite in the volume, and Fly does not copy volumes between machines, so a second machine would have its own empty data. Do not run `fly scale count 2` or `fly machine clone`.

The file keeps the machine running (`auto_stop_machines = "off"`, `min_machines_running = 1`). Reminders, scheduled backups and email to task run on the server, so a machine that Fly stopped when idle would miss them. You can set `auto_stop_machines = "stop"` to pay only while it is used, if you do not need those.

## Your own domain

Point your domain at the app (`fly ips list` shows its addresses; a `CNAME` to `<app>.fly.dev` also works), then:

```bash
fly certs add todo.example.com
```

When `fly certs show todo.example.com` reports the certificate as issued, set `OPENTODO_BASE_URL = "https://todo.example.com"` in `fly.toml` and run `fly deploy`. More on proxies and https in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

`fly.toml` uses the `stable` image, which every release moves. Fly does not update a running app by itself: run `fly deploy` in the folder with `fly.toml`, and it fetches the release `stable` points at then. Migrations run on start. There are no down-migrations, so back up first. To stay on one release line, set `image = "ghcr.io/pixari/opentodo:0.6"` under `[build]` (or pin one version, `0.6.1`).

Fly takes daily snapshots of the volume and keeps them for a few days (`fly volumes snapshots list <volume id>`; `fly volumes list` shows the id). For backups you control, turn on scheduled backups in OpenTodo's **Settings → Server** and send them to S3 or WebDAV; the local `backups/` folder is in the same volume, so it does not protect against losing the volume. See [Backups](../backups.md).

## Troubleshooting

- **`fly deploy` asks which app to use, or deploys a new one**: run it in the folder where `fly launch` wrote the app name into `fly.toml`.
- **The setup screen says the token is wrong**: set a new one with `fly secrets set OPENTODO_SETUP_TOKEN=...` and try again after the machine restarts.
- **The machine stops right after starting and `fly logs` says "permission denied" on `/data`**: Fly gives the volume to the image's user (65532) when it mounts it, so this should not happen. If it does, [open an issue](https://github.com/pixari/opentodo/issues) with the log.
