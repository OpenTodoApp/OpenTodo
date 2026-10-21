---
title: Running on Render
summary: Deploy to Render with the Blueprint, the paid instance and disk it needs, the setup token, the https address and custom domains, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 36
---
# Running OpenTodo on Render

OpenTodo is one container with one data folder and no required settings. On [Render](https://render.com) it runs as a web service that pulls the released image, with a persistent disk on `/data` and https on its `onrender.com` address.

**It costs money.** The database lives on a persistent disk, and Render only attaches disks to paid instance types; a Free web service loses its files on every restart. The Blueprint uses the smallest paid instance (0.5 CPU, 512 MB, plenty for OpenTodo) and a 1 GB disk; see [Render's pricing](https://render.com/pricing).

## Deploy

1. Click the button (or open the link) and sign in to Render:

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pixari/opentodo&path=deploy/render/render.yaml)

   ```
   https://render.com/deploy?repo=https://github.com/pixari/opentodo&path=deploy/render/render.yaml
   ```

2. Give the Blueprint a name. Check that **Blueprint Path** says `deploy/render/render.yaml`; if it shows `render.yaml`, type `deploy/render/render.yaml`.
3. Review the service `opentodo` and its disk, and click **Deploy Blueprint**.

Without the button: **New → Blueprint** in the Render Dashboard, choose **Public Git Repository** and enter `https://github.com/pixari/opentodo` (or connect your fork), branch `main`, **Blueprint Path** `deploy/render/render.yaml`, then **Deploy Blueprint**.

The service is deployed in Render's default region (Oregon). For another region, deploy from a fork with `region:` (for example `frankfurt`) added to the service in `deploy/render/render.yaml`; the region cannot be changed later.

## First visit

1. Open the service's **Environment** page and copy the value of `OPENTODO_SETUP_TOKEN` (Render generated it).
2. Open the service's address, `https://opentodo.onrender.com` or similar (shown at the top of the service page).
3. The first visitor creates the owner account; the setup screen asks for the token. After that, sign-up is closed and the owner invites people.

The address is public from the first minute, which is why the token is set: without it, whoever opens the address first would become the owner.

## Settings

| Variable | Value | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | the service's `https://….onrender.com` address | Taken from the service (`RENDER_EXTERNAL_URL`). Passkeys, secure cookies and links in emails use it. |
| `OPENTODO_SETUP_TOKEN` | generated | Asked when the owner account is created. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the address create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Leave it empty: Render's load balancer is the only proxy, and OpenTodo trusts proxies on private addresses by default. Set `cloudflare` if you put Cloudflare's proxy in front of a custom domain. |
| `PORT` | `8080` | Tells Render which port OpenTodo listens on. Do not change it. |

Change or add variables on the service's **Environment** page (other `OPENTODO_*` variables are in the [configuration table](https://github.com/pixari/opentodo#configuration)); saving redeploys the service.

## A custom domain

Add the domain under the service's **Settings → Custom Domains** and follow Render's DNS steps; Render issues the certificate. Then point OpenTodo at it:

1. On the Blueprint's **Settings** page, set **Auto Sync** to **No**. Otherwise the next sync of the Blueprint sets `OPENTODO_BASE_URL` back to the onrender.com address.
2. On the service's **Environment** page, set `OPENTODO_BASE_URL` to `https://todo.example.com` and save.

Passkeys belong to one address, so register them after the switch (or register them again).

## Updates

The service uses the `stable` image, which every release moves. Render does not redeploy when the tag moves, but it pulls the image again on every deploy. To update, open the service and click **Manual Deploy → Deploy latest reference**. To automate it, call the service's **Deploy Hook** URL (under **Settings**) from a scheduled job of your own. Migrations run on start and there are no down-migrations, so back up first. Render stops the old instance before starting the new one when a disk is attached, so a deploy has a few seconds of downtime.

With **Auto Sync** on, a change to the Blueprint file in OpenTodo's repository also redeploys the service; such changes are listed in the [changelog](https://github.com/pixari/opentodo/blob/main/CHANGELOG.md).

To stay on one release line, set the image to `ghcr.io/pixari/opentodo:0.9` (or one version, `0.9.0`) as the **Image URL** in the service's **Settings**, with **Auto Sync** off (a sync would set `stable` again).

## Data and backups

Everything OpenTodo stores (the database, attachments and its own backups) is on the disk mounted on `/data`. Render takes a snapshot of the disk every day and keeps it for at least seven days (**Disks** page of the service, [Persistent Disks](https://render.com/docs/disks#disk-snapshots)); restoring one replaces the whole disk. For backups off Render, turn on scheduled backups in OpenTodo's **Settings → Server** with an S3 or WebDAV destination. Backups written only to `backups/` stay on the same disk. The image has no shell, so Render's shell and SSH cannot open it. See [Backups](../backups.md).

The service runs one instance: a service with a disk cannot be scaled out.

## Troubleshooting

- **The deploy fails right after it starts**: the log names the setting, for example a setup token shorter than 16 characters if you replaced it.
- **The log says "permission denied", "readonly database" or "unable to open database file"**: OpenTodo cannot write the disk on `/data`. Check that the disk's mount path is `/data` and [open an issue](https://github.com/pixari/opentodo/issues) with the log.
- **Sign-in does not stick after adding a custom domain**: `OPENTODO_BASE_URL` still names the other address. Set it to the address you open (see above).
- **Live updates do not arrive**: see [Live updates through the proxy](docker.md#live-updates-through-the-proxy) for the test page.
