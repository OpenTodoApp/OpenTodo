---
title: Running on Railway
summary: The Railway template, what it sets up (one service, a volume on /data, the setup token, the https address), the first visit, a custom domain, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 36
---
# Running OpenTodo on Railway

OpenTodo is one container with one data folder and no required settings. On [Railway](https://railway.com) it runs as one service from the released image, with a volume on `/data` and https on its `up.railway.app` address.

Deploy it from the template: [railway.com/deploy/opentodo](https://railway.com/deploy/opentodo?referralCode=nbgVDr). This link supports the project: OpenTodo receives a share when you deploy through it. It's new; if something here doesn't match what you see, please [open an issue](https://github.com/OpenTodoApp/OpenTodo/issues).

**If the first deploy keeps restarting** with `OPENTODO_BASE_URL must be an absolute URL, got "https://"` (or, from the next release, `OPENTODO_BASE_URL has no host name`), the service has no public address yet: open its **Settings → Networking**, choose **Generate Domain** with port **8080**, then **Deployments → Redeploy**.

## What the template sets up

- One service from the image `ghcr.io/opentodoapp/opentodo:stable`, with one replica (Railway allows no replicas with a volume).
- A volume mounted on `/data`. The database, attachments and OpenTodo's own backups live there.
- Health check path `/healthz`, and an https domain on port 8080.
- These variables:

| Variable | Value | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | The service's own https address. Passkeys, secure cookies and links in emails use it. |
| `OPENTODO_SETUP_TOKEN` | generated (`${{secret(32)}}`) | Asked when the owner account is created. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the address create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Leave it empty: Railway's edge proxy is the only hop, and OpenTodo trusts proxies on private addresses by default. |
| `PORT` | `8080` | The port OpenTodo listens on, which Railway routes to and health-checks. Don't change it. |
| `RAILWAY_RUN_UID` | `0` | The image runs as a non-root user, and Railway's volumes are writable by root only. With `0`, OpenTodo can write to `/data` ([Railway: Volumes](https://docs.railway.com/reference/volumes)). |

Other `OPENTODO_*` variables are in the [configuration table](https://github.com/OpenTodoApp/OpenTodo#configuration). Change them in the service's **Variables** tab; saving redeploys the service.

## First visit

1. Open the service's **Variables** tab and copy the value of `OPENTODO_SETUP_TOKEN`.
2. Open the service's address (under **Settings → Networking**, `https://….up.railway.app`).
3. The first visitor creates the owner account, and the setup screen asks for the token. After that, sign-up is closed and the owner invites people.

The address is public from the first minute, which is why the token is set: without it, whoever opens the address first would become the owner.

## A custom domain

Add the domain under the service's **Settings → Networking → Custom Domain** and follow Railway's DNS steps. Then set `OPENTODO_BASE_URL` to `https://todo.example.com` in **Variables**. Passkeys belong to one address, so register them after the switch, or register them again.

## Updates

The service uses the `stable` image, which every release moves. To update, redeploy the service (**Deployments → Redeploy**): Railway pulls the image again. Migrations run on start and there are no down-migrations, so back up first. To stay on one release line, set the image to `ghcr.io/opentodoapp/opentodo:1.11`, or to one version such as `1.11.0`, in the service's **Settings → Source**.

## Data and backups

Everything OpenTodo stores is on the volume mounted on `/data`. For backups off Railway, turn on scheduled backups in OpenTodo's **Settings → Server → Backups** with an S3 or WebDAV destination; backups written only to `backups/` stay on the same volume. See [Backups](../backups.md).

## Troubleshooting

- **The log says "permission denied", "readonly database" or "unable to open database file"**: OpenTodo can't write the volume. Check that the volume's mount path is `/data` and that `RAILWAY_RUN_UID` is `0`.
- **The deploy never becomes healthy**: check that `PORT` is `8080` and the health check path is `/healthz`.
- **Sign-in doesn't stick after adding a custom domain**: `OPENTODO_BASE_URL` still names the other address. Set it to the address you open.
