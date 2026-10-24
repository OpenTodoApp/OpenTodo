---
title: Running on Dokploy
summary: Deploy from Dokploy's templates (or a templates base URL), the setup token, the generated http domain, https with your own domain, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 28
---
# Running OpenTodo on Dokploy

OpenTodo is one container with one named volume and no required settings. The Dokploy template fills in the domain and generates a setup token for the owner account.

## Install

OpenTodo's template is submitted to Dokploy's catalogue ([Dokploy/templates#1265](https://github.com/Dokploy/templates/pull/1265)). Once it is listed, create a service from a **Template** and pick **OpenTodo**. Until then, use one of these two ways:

- **Templates base URL.** In a project, create a service from a **Template**. Dokploy's template dialog accepts another base URL instead of `https://templates.dokploy.com`. Enter `https://raw.githubusercontent.com/pixari/opentodo/main/deploy/dokploy`, pick **OpenTodo** and create it.
- **By hand.** Choose **Create Service → Compose** and paste [`docker-compose.yml`](https://github.com/pixari/opentodo/blob/main/deploy/dokploy/blueprints/opentodo/docker-compose.yml) as the compose file. Under **Environment**, add the variables from [`template.toml`](https://github.com/pixari/opentodo/blob/main/deploy/dokploy/blueprints/opentodo/template.toml), with at least 16 random letters and digits for `OPENTODO_SETUP_TOKEN`. Under **Domains**, add a domain for the service `opentodo` on port `8080`.

Then click **Deploy**.

## First visit

Open the domain from the service's **Domains** tab. The first visitor creates the owner account, and the setup screen asks for the setup token. You find the token in the service's **Environment** tab as `OPENTODO_SETUP_TOKEN`. After that, sign-up is closed and the owner invites people.

## Settings

| Variable | Template value | What it does |
| --- | --- | --- |
| `OPENTODO_SETUP_TOKEN` | generated, 32 characters | Asked for when the owner account is created, so a stranger cannot claim a new server first. |
| `OPENTODO_BASE_URL` | empty | The https address people open. Leave it empty while the domain is plain http (see below). |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Set it to `cloudflare` when the domain is proxied by Cloudflare. |

Change them in the **Environment** tab and redeploy. Other `OPENTODO_*` variables from the [configuration table](https://github.com/pixari/opentodo#configuration) take effect when you add them there and to the `environment` list of the compose file.

## https and your own domain

The domain the template creates is a generated `*.sslip.io` name served over plain http. On it, tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there.

Keep `OPENTODO_BASE_URL` empty on plain http. An `https://` value there makes the session cookie secure-only, so the browser drops it and you cannot sign in.

For https, point your own domain at the server and edit the domain in the **Domains** tab: set the host to your domain, turn **HTTPS** on and choose **Let's Encrypt** as the certificate. Then set `OPENTODO_BASE_URL` to `https://` followed by your domain, for example `https://todo.example.com`, and redeploy. More on proxies and https in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The template pins one release, such as `ghcr.io/pixari/opentodo:0.12.0`, because Dokploy's catalogue only accepts fixed versions. A service keeps the version it was created with. To update, change the image tag in the service's compose file to the [new release](https://github.com/pixari/opentodo/releases) and click **Deploy**; migrations run on start. There are no down-migrations, so back up first. To follow every release without editing, use `ghcr.io/pixari/opentodo:stable` (every release moves it) and add `pull_policy: always` under the image, so **Deploy** fetches the current one.

Everything OpenTodo stores (the database, attachments and its own backups) is in the named volume `opentodo-data`. Back it up with Dokploy's **Volume Backups** to an S3 destination, or turn on scheduled backups in OpenTodo's **Settings → Server**. See [Backups](../backups.md).

## Troubleshooting

- **Sign-in does not stick**: `OPENTODO_BASE_URL` starts with `https://` but the domain is plain http. Empty it, or turn on HTTPS for the domain, then redeploy.
- **The setup screen says the token is wrong**: copy `OPENTODO_SETUP_TOKEN` from the Environment tab again. A token shorter than 16 characters stops the container on start (its log says so).
