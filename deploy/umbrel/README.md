# Umbrel App Store package

[`umbrel-app.yml`](umbrel-app.yml) and [`docker-compose.yml`](docker-compose.yml) are OpenTodo's package for the official [Umbrel App Store](https://apps.umbrel.com) ([`getumbrel/umbrel-apps`](https://github.com/getumbrel/umbrel-apps)):

- the manifest: id `opentodo`, category `files` (Umbrel has no productivity category), port 8418 (the address Umbrel opens, unique in the store), `storage.dataRoot: data` so users can move the data to another drive, no default credentials (the first visitor creates the owner), and four optional settings in umbrelOS's app settings (`environment`: base URL, setup token, open sign-up, trusted proxies; the compose file sets none of them, so OpenTodo's defaults apply);
- the compose file: `app_proxy` routes to `opentodo_web_1:8080` with Umbrel login on; the `web` service runs the release image **pinned by tag and digest** (Umbrel requires it), as user `1000:1000` (the owner of Umbrel's app data; the static binary runs as any user that can write `/data`), `restart: on-failure`, `${APP_DATA_DIR}/data` on `/data`, no ports and no networks.

`PROXY_AUTH_WHITELIST` lets through, without Umbrel's login cookie, only what clients need and OpenTodo protects itself: `/api/*` (API tokens, the browser extension), CalDAV (`/dav`, `/.well-known/caldav`), calendar feeds (`/feeds/*`), MCP (`/mcp`), public list links (`/public/*`) and the static files such a page loads (`/assets/*`, `/appearance.js`). `PROXY_AUTH_BLACKLIST` keeps `/api/v1/auth/register` behind Umbrel login, so nobody else on the network can create the owner account through the API before you open the app. `scripts/deploy/umbrel.mjs` checks that every listed route is one OpenTodo serves (`internal/httpapi`, `web/public`).

Umbrel's login is one password for the whole device, so people you invite to OpenTodo also pass it to open the web app. On umbrelOS 2.0 the owner can turn off **Require Umbrel login** in OpenTodo's app settings; then OpenTodo's own login is the only one (set a setup token first if the device is reachable by others).

**Status: Submitted: [getumbrel/umbrel-apps#6251](https://github.com/getumbrel/umbrel-apps/pull/6251).** `submission` in `umbrel-app.yml` is that URL.

**CalDAV on iOS and macOS.** The whitelist covers `/.well-known/caldav` and `/dav`, but iOS (and macOS) Calendar first sends `PROPFIND /` to the server address, and `/` is behind Umbrel's login, so automatic discovery ends at the Umbrel login page. Enter the full address by hand as the server: `https://<host>/.well-known/caldav` (or the `/dav/` address shown in OpenTodo's settings). `docs/self-hosting/umbrel.md` says the same for users.

## Files

| File | What it is |
| --- | --- |
| `umbrel-app.yml`, `docker-compose.yml` | The package, edited here |
| `upstream/opentodo/` | The folder as it goes into `getumbrel/umbrel-apps`: identical copies of the two files and `data/.gitkeep` (Umbrel creates `data/` from it, owned by 1000:1000). No icon or gallery files: Umbrel hosts those itself |
| `upstream/PR.md` | The pull request title and body, from the repository's template |

`make check` (`node scripts/deploy-check.mjs`) fails when the copies differ, the manifest `version` is not the image tag, the image is not the latest release with a digest, a field is out of Umbrel's order, or a whitelisted route does not exist.

## Install it now, without the App Store

Not on umbrelOS: it installs apps only from app stores, and OpenTodo has no community app store (that would be a separate repository with its own app ids). Until the package is listed, run OpenTodo on another Docker host ([Running with Docker](../../docs/self-hosting/docker.md)) or test the package on an umbrelOS device as in step 4 below.

## Submitting (maintainer)

1. Fork `getumbrel/umbrel-apps` on GitHub (branch `master`) and clone the fork.
2. Copy the package: `cp -R deploy/umbrel/upstream/opentodo <fork>/opentodo`.
3. In the fork: `npm ci && npm run lint:apps -- opentodo --check-images` must report no issues (it also checks that port 8418 is still free; if another app took it meanwhile, pick a free port here, in `umbrel-app.yml`, and copy again).
4. Test through umbrelOS, as the repository's `.agents/skills/umbrel-test-app/SKILL.md` asks: on an Umbrel device (copy the folder into `~/umbrel/app-stores/getumbrel-umbrel-apps-github-53f74447/opentodo/`, without `.gitkeep`) or in the `ghcr.io/getumbrel/umbrelos` container. Install, open OpenTodo from the home screen, create the owner, add a task, restart the app through Umbrel and check the task is still there; check CalDAV or an API token without the Umbrel cookie. Done for the submission (see `upstream/PR.md`).
5. Commit (`Add OpenTodo`), push, and open the pull request with the title and body from [`upstream/PR.md`](upstream/PR.md), with the test results filled in and the AI-use line confirmed. Attach the logo and screenshots it links.
6. Put the pull request's URL in `submission` (here, then copy to `upstream/opentodo/`) and push it to the pull request branch. Umbrel adds the gallery images before merging. Done: `https://github.com/getumbrel/umbrel-apps/pull/6251`; `make check` refuses the `0000` placeholder.

## On every release

Umbrel offers an update only when the manifest `version` changes, and it requires a digest, so each release needs a pull request to `getumbrel/umbrel-apps` once the release job has published the image:

1. Set `version` in `umbrel-app.yml` and the tag in `docker-compose.yml` to the new version, and write `releaseNotes` (a few lines from CHANGELOG.md, folded with `>-`; Umbrel shows them in the update dialog).
2. `node scripts/deploy/pin.mjs` rewrites the digest of every pinned reference under `deploy/` with the registry's multi-arch index digest; `node scripts/deploy/pin.mjs --check` verifies it.
3. Copy both files to `upstream/opentodo/`, run `node scripts/deploy-check.mjs`, then copy `upstream/opentodo/` into the fork and open a pull request titled `Update OpenTodo to <version>`, with the repository's template (type: App update) and the update path tested through Umbrel.

Release candidates are never submitted.
