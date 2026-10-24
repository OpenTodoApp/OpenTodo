# Pull request to getumbrel/umbrel-apps

Submitted on 2026-10-24 as [getumbrel/umbrel-apps#6251](https://github.com/getumbrel/umbrel-apps/pull/6251). The title and body below are what was submitted, kept as the record of it; later updates to the app are separate pull requests (see ../README.md).

## Title

Add OpenTodo

## Body

## Type

New app

## App

App ID: `opentodo`
Upstream project: https://github.com/pixari/opentodo (website https://open-todo.app, AGPL-3.0)
Version: 0.11.0

## Summary

Adds OpenTodo, an open-source, local-first task manager: projects, labels, due dates, reminders, boards, sharing, CalDAV, calendar feeds and an API, as a web app that can be installed on a phone. One container (`ghcr.io/pixari/opentodo`, multi-arch amd64 and arm64, a static Go binary with SQLite) with all its data in `${APP_DATA_DIR}/data`.

- `web` runs the image pinned by tag and index digest (checked with `docker buildx imagetools inspect`: linux/amd64 and linux/arm64), as `1000:1000` (the image's default user is 65532, but the binary runs as any user that can write `/data`, so the Umbrel-owned data folder needs no permission fix), `restart: on-failure`, no ports and no networks.
- `app_proxy` routes port 8418 to `opentodo_web_1:8080` with Umbrel login kept on.
- First run: there are no default credentials. The first person to open the app creates the owner account, behind Umbrel login; after that sign-up is closed and the owner invites people.

## Verification

Umbrel testing performed: fresh install of `opentodo` 0.11.0 through umbrelOS 2.0.0 (`ghcr.io/getumbrel/umbrelos:2.0.0` container), driven with `umbreld client` and a headless Chromium:

- The package was copied into the official store source (`app-stores/getumbrel-umbrel-apps-github-53f74447/opentodo`, without `.gitkeep`); `appStore.registry.query` listed it, `apps.install.mutate` installed it and `apps.state.query` reported `ready`. The data folder was created as `umbrel:umbrel` and OpenTodo wrote its database there as `1000:1000`.
- Opened the app on its port (8418) over http: Umbrel's app-auth page appeared, and after the Umbrel password OpenTodo's setup screen. Created the owner account in the browser and added a task.
- Restarted through `apps.restart.mutate`; in a fresh browser context (no local data) over `https://` on the same port, signed in to OpenTodo and the task was there (served by the server, not from the browser's cache).
- App settings: the four `environment` entries appear in `apps.list.query`; setting `OPENTODO_ALLOW_SIGNUP=true` through `apps.setSettings.mutate` restarted the app and OpenTodo picked it up (logged `signup_open=true`); set it back to `false` afterwards.
- Proxy auth, without the Umbrel cookie: `/` and `/settings` redirect to Umbrel login; `POST /api/v1/auth/register` (blacklisted) redirects to Umbrel login; `/api/*` reaches OpenTodo (401 without credentials, 200 with a session or an API token, and the task is listed); after enabling CalDAV in OpenTodo, `/.well-known/caldav` redirects to `/dav/`, `PROPFIND /dav/` answers 401 without credentials and 207 with an OpenTodo app password; `/mcp`, `/feeds/*`, `/public/*` and `/appearance.js` are answered by OpenTodo.
- Settled logs show no warnings or errors.

Two adjustments were needed only to run the umbrelOS container on this host (WSL2, so not exactly the documented setup): the container used published ports instead of `--network host`, with the browser reaching the device's `localhost` through a small HTTP proxy inside the container; and the WSL2 kernel has no `nft_fib_inet`, so umbreld's LAN-ingress rule `fib daddr type local ... redirect` failed to load. A wrapper around `nft` dropped the `fib daddr type local` match so the rule (and the app gateway on 8418) loaded. Nothing in the package was changed for this.

Environment tested:
- [ ] Umbrel device
- [x] Local umbrelOS test environment
- [ ] Not runtime tested

Architecture tested:
- [x] amd64
- [ ] arm64 (not run; the image index has linux/arm64, built from the same Go source)

Known lint warnings or caveats: `npm run lint:apps -- opentodo --check-images` reports no issues; `git diff --check` is clean.

## Notes

Permissions, dependencies, migrations, default credentials, or caveats:

- No permissions, no dependencies, no default credentials (`defaultUsername`/`defaultPassword` are empty: the first visitor creates the owner).
- `PROXY_AUTH_WHITELIST` lists only routes that clients use without the Umbrel cookie, all protected by OpenTodo itself: `/api/*` (API tokens, the browser extension), `/dav`, `/dav/*`, `/.well-known/caldav`, `/.well-known/caldav/*` (CalDAV with app passwords; off until the owner enables it), `/feeds/*` (calendar feeds, secret in the address), `/mcp` (MCP clients with API tokens; off until the owner enables it), `/public/*` (read-only public list links, secret in the address) and `/assets/*`, `/appearance.js` (the static web app files a public list page loads).
- `PROXY_AUTH_BLACKLIST: /api/v1/auth/register` keeps account creation behind Umbrel login, so nobody on the network can claim the owner account through the API before the user opens the app.
- `environment` offers four optional settings in umbrelOS's app settings: the base URL (only for an https address of the user's own), a setup token, open sign-up and trusted proxies. The compose file sets none of them, so OpenTodo's defaults apply.
- Migrations run on start; there are no down-migrations.
- Installing the web app on a phone, offline use, push notifications, passkeys and end-to-end encryption need an https address the browser trusts; everything else works over Umbrel's http address.
- Updates: each OpenTodo release will come as an "Update OpenTodo to x.y.z" pull request with the new tag, digest and release notes.

Logo: https://raw.githubusercontent.com/pixari/opentodo/main/web/public/pwa-512.png (512×512 PNG; SVG: https://raw.githubusercontent.com/pixari/opentodo/main/deploy/coolify/opentodo.svg)

<img src="https://raw.githubusercontent.com/pixari/opentodo/main/web/public/pwa-512.png" width="128" alt="OpenTodo logo">

Screenshots (light and dark):

![Today, light](https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/today-light.webp)
![Board, light](https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/board-light.webp)
![Today, dark](https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/today-dark.webp)
![Board, dark](https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/board-dark.webp)

AI use: this package was prepared and tested with an AI coding agent (Claude Code), following this repository's `.agents/skills`, and is submitted by the OpenTodo maintainer.
