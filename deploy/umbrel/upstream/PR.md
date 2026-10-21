# Pull request to getumbrel/umbrel-apps

Title: `Add OpenTodo`

Body (the repository's pull request template, filled in; replace the bracketed parts before opening it):

---

## Type

New app

## App

App ID: `opentodo`
Upstream project: https://github.com/pixari/opentodo (website https://open-todo.app, AGPL-3.0)
Version: 0.9.0

## Summary

Adds OpenTodo, an open-source, local-first task manager: projects, labels, due dates, reminders, boards, sharing, CalDAV, calendar feeds and an API, as a web app that can be installed on a phone. One container (`ghcr.io/pixari/opentodo`, multi-arch amd64 and arm64, a static Go binary with SQLite) with all its data in `${APP_DATA_DIR}/data`.

- `web` runs the image pinned by tag and index digest, as `1000:1000` (the image's default user is 65532, but the binary runs as any user that can write `/data`, so the Umbrel-owned data folder needs no permission fix), `restart: on-failure`, no ports and no networks.
- `app_proxy` routes port 8418 to `opentodo_web_1:8080` with Umbrel login kept on.
- First run: there are no default credentials. The first person to open the app creates the owner account, behind Umbrel login; after that sign-up is closed and the owner invites people.

## Verification

Umbrel testing performed: [none yet / describe]

Environment tested:
- [ ] Umbrel device
- [ ] Local umbrelOS test environment
- [x] Not runtime tested

Architecture tested:
- [x] amd64
- [ ] arm64

What was tested so far, outside umbrelOS (not Umbrel verification): `npm run lint:apps -- opentodo --check-images` reports no issues; the compose file was run with Docker Compose on amd64 with a `1000:1000`-owned bind mount for `/data`, the service as `1000:1000` and a port mapped in place of `app_proxy`: `/healthz` answered ok, the owner account was created, a task was added, the stack was restarted and the task was still there, and a second sign-up was refused. A containerized umbrelOS test was not run (not enough disk space in that environment for the umbrelOS image). [Before opening: install through umbrelOS (device or the `umbrelos` container), open the app from the home screen, create the owner, add a task, restart through Umbrel, check the task, check the whitelisted routes below without the Umbrel cookie and `/api/v1/auth/register` with it only, and update the checkboxes.]

Known lint warnings or caveats: none from the linter.

## Notes

Permissions, dependencies, migrations, default credentials, or caveats:

- No permissions, no dependencies, no default credentials (`defaultUsername`/`defaultPassword` are empty: the first visitor creates the owner).
- `PROXY_AUTH_WHITELIST` lists only routes that clients use without the Umbrel cookie, all protected by OpenTodo itself: `/api/*` (API tokens, the browser extension), `/dav`, `/dav/*`, `/.well-known/caldav`, `/.well-known/caldav/*` (CalDAV with app passwords), `/feeds/*` (calendar feeds, secret in the address), `/mcp` (MCP clients with API tokens), `/public/*` (read-only public list links, secret in the address) and `/assets/*`, `/appearance.js` (the static web app files a public list page loads).
- `PROXY_AUTH_BLACKLIST: /api/v1/auth/register` keeps account creation behind Umbrel login, so nobody on the network can claim the owner account through the API before the user opens the app.
- `environment` offers four optional settings in umbrelOS's app settings: the base URL (only for an https address of the user's own), a setup token, open sign-up and trusted proxies. The compose file sets none of them, so OpenTodo's defaults apply.
- Migrations run on start; there are no down-migrations.
- Installing the web app on a phone, offline use, push notifications, passkeys and end-to-end encryption need an https address the browser trusts; everything else works over Umbrel's http address.
- Updates: each OpenTodo release will come as an "Update OpenTodo to x.y.z" pull request with the new tag and digest and release notes.

Logo: https://raw.githubusercontent.com/pixari/opentodo/main/web/public/pwa-512.png (512×512 PNG; SVG: https://raw.githubusercontent.com/pixari/opentodo/main/deploy/coolify/opentodo.svg)

Screenshots (light and dark):

- https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/today-light.webp
- https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/board-light.webp
- https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/today-dark.webp
- https://raw.githubusercontent.com/pixari/opentodo/main/docs/images/board-dark.webp

AI use: this package was written with an AI coding agent (Claude Code), following this repository's `.agents/skills`, and reviewed by the OpenTodo maintainer before submission. [Maintainer: confirm or correct this line.]

---

After opening the pull request, put its URL in `submission` (deploy/umbrel/umbrel-app.yml, then copy it to `upstream/opentodo/`) and push that change to the pull request branch.
