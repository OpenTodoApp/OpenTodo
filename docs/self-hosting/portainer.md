---
title: Running on Portainer
summary: Deploy from Portainer's App Templates, the settings, the volume, https and reverse proxies, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 29
---
# Running OpenTodo on Portainer

OpenTodo is one container with one volume and no required settings. Its Portainer app template fills in the image, the port, the volume and the restart policy.

## Install

1. In Portainer, open **Settings → App Templates**, paste this URL into **URL** and save:

   ```
   https://raw.githubusercontent.com/pixari/opentodo/main/deploy/portainer/portainer-template.json
   ```

   This replaces the list of templates Portainer shows. Note the previous URL if you want to switch back later.
2. Open your environment, go to **App Templates** and pick **OpenTodo**.
3. Check the settings below and click **Deploy the container**.

OpenTodo has been submitted to the community list [Lissy93/portainer-templates](https://github.com/Lissy93/portainer-templates) ([#160](https://github.com/lissy93/portainer-templates/pull/160)); once it is merged, people who load that list find it there as well.

Without templates, the same container is:

```bash
docker run -d --name opentodo --restart unless-stopped \
  -p 8080:8080 -v opentodo-data:/data ghcr.io/pixari/opentodo:stable
```

## First visit

Open `http://<your-host>:8080` right after deploying. The first visitor creates the owner account; if you set a setup token, the setup screen asks for it. After that, sign-up is closed and the owner invites people.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Setup token | empty | Optional, 16+ characters (for example from `openssl rand -hex 16`). Set it when others can reach the server, so a stranger cannot create the owner account first. |
| Public https address | empty | `OPENTODO_BASE_URL`. Leave it empty when you open OpenTodo by the server's address. Behind a reverse proxy, set the https address people open, for example `https://todo.example.com`. |
| Open sign-up | Closed | Open lets anyone who can reach the server create an account. |
| Trusted proxies | empty | Reverse proxies whose `X-Forwarded-For` is trusted, or `cloudflare`. Set it only when every request comes through them. |

The port (`8080`) can be changed on the host side under **Advanced options**. Other `OPENTODO_*` variables from the [configuration table](https://github.com/pixari/opentodo#configuration) can be added there as environment variables.

## https and reverse proxies

On `http://<your-host>:8080`, tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. Put OpenTodo behind a reverse proxy with a certificate (Nginx Proxy Manager, Caddy, Traefik) or use Tailscale's https, then set the public https address. Do not set an `https://` address while you open OpenTodo over plain http: the session cookie becomes secure-only and sign-in fails. More in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The template uses the `stable` image, which every release moves. To update, open the container, click **Recreate** and turn on **Re-pull image**. The volume is kept and migrations run on start. There are no down-migrations, so back up first. To stay on one release line, recreate the container with the image `ghcr.io/pixari/opentodo:0.6` (or one version, `0.6.1`).

Everything OpenTodo stores (the database, attachments and its own backups) is in the volume Portainer created for `/data`; find it in the container's **Volumes** section. Back it up from the host, or turn on scheduled backups in OpenTodo's **Settings → Server** (written to `backups/` in the same volume, or to S3 or WebDAV). See [Backups](../backups.md).

## Troubleshooting

- **Sign-in does not stick**: the public https address is set but you open OpenTodo over plain http. Clear it and recreate the container.
- **The container stops right after it starts**: its log names the setting, for example a setup token shorter than 16 characters.
