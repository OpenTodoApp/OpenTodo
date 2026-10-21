---
title: Running on Easypanel
summary: Set up OpenTodo as an Easypanel app service (or, once listed, from its templates), the setup token, the https domain, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 24
---
# Running OpenTodo on Easypanel

OpenTodo is one container with one volume and no required settings. On [Easypanel](https://easypanel.io) it is one **App** service; Easypanel puts its domain behind https for you.

An OpenTodo template has been prepared for Easypanel's template list but is not listed yet. Until it is, set the service up by hand as below; the result is the same.

## Install as an app service

1. In a project, click **+ Service → App** and name it `opentodo`.
2. **Source**: choose **Docker Image** and enter `ghcr.io/pixari/opentodo:0.9.0`.
3. **Environment**: add

   ```
   OPENTODO_BASE_URL=https://$(PRIMARY_DOMAIN)
   OPENTODO_SETUP_TOKEN=<a random string of 32 letters and digits>
   OPENTODO_ALLOW_SIGNUP=false
   OPENTODO_TRUSTED_PROXIES=
   ```

   `$(PRIMARY_DOMAIN)` is the service's main domain. Generate the token with a password manager or `openssl rand -hex 16`.
4. **Domains**: the service's domain must point to port **8080** (the default domain Easypanel gives the service is fine).
5. **Mounts**: add a **Volume** named `data` with the mount path `/data`.
6. **Deploy**, then open the domain. The first visitor creates the owner account and is asked for the setup token (it is in the service's **Environment**). After that, the owner invites people (sign-up is closed).

## Install from the template list

Once OpenTodo is listed: in a project, choose **+ Service → Templates**, search for **OpenTodo** and click **Create**. The template sets up everything above and generates the setup token; the template's instructions say where to find it.

## The settings

| Variable | Template value | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | `https://$(PRIMARY_DOMAIN)` | The https address people open. Passkeys, secure cookies and links in emails use it. If you add a domain of your own and make it primary, check this matches the address people open, then redeploy. |
| `OPENTODO_SETUP_TOKEN` | generated | Asked once, when the owner account is created, so a fresh server on the internet cannot be claimed by a stranger. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | The reverse proxies whose `X-Forwarded-For` is trusted, or `cloudflare` when the domain is behind Cloudflare's proxy. |

Every other `OPENTODO_*` variable from the [configuration table](https://github.com/pixari/opentodo#configuration) can be added in **Environment**. Installing the app, offline use, push notifications, passkeys and end-to-end encryption need https; Easypanel's domains have it. If you open OpenTodo by plain http instead (the server's address and a published port), empty `OPENTODO_BASE_URL`, because an https base URL over plain http breaks signing in. More on proxies in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates and backups

The service names one release (`0.9.0`), never a moving tag, so it changes only when you change it: set the image to the new release under **Source** and **Deploy**. Migrations run on start and there are no down-migrations, so back up first.

Everything OpenTodo stores is in the `data` volume. Turn on scheduled backups in **Settings → Server** (written to `backups/` in the same volume, or to S3 or WebDAV) to get copies off the server. See [Backups](../backups.md).
