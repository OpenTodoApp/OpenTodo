# Design: Home Assistant add-on

## Decisions

### D1. Own image on Home Assistant's base

OpenTodo's image is distroless: it has no shell to read `/data/options.json`, and it runs as user 65532 while the Supervisor creates the add-on's `/data` owned by root. Using it directly (`legacy: true`) would leave the options without effect and the data directory unwritable. The add-on image is `FROM ghcr.io/home-assistant/base` (Alpine, s6-overlay, bashio) with `COPY --from=ghcr.io/pixari/opentodo:<release> /opentodo /usr/bin/opentodo` and a start script, so no Go code is built twice and the binary is exactly the released one. It runs as root inside the add-on container like other add-ons, in its own AppArmor profile (the binary, `/data`, the network and a few system files).

The image is built with Home Assistant's builder actions (`prepare-multi-arch-matrix`, `build-image`, `publish-multi-arch-manifest`, pinned to a release) on native amd64 and arm64 runners, signed with Cosign, and `skip-existing` keeps a published version from ever being replaced.

The start script reads `/data/options.json` with `jq` rather than `bashio::config`, which asks the Supervisor API: the same image then starts with a plain `options.json` outside Home Assistant, which the repository's smoke test does.

### D2. No Ingress

Ingress serves an add-on under `/api/hassio_ingress/<token>/` on Home Assistant's address, with a token that differs per installation. OpenTodo 0.12.0 behind a proxy that strips that prefix shows a blank page: its HTML loads `/assets/…`, `/appearance.js` and `/registerSW.js` from the root, which Home Assistant answers, and its API calls go to `/api/v1/…`, which is Home Assistant's own `/api`. Supporting it would need a base path known only at request time (`X-Ingress-Path`) in the HTML, the router, every API call (about 40 files), the service worker scope, the manifest, the cookie path and the Content-Security-Policy; passkeys and push would still be tied to Home Assistant's origin rather than OpenTodo's. That is not a small or low-risk change, so the add-on publishes port 8080 with `webui: http://[HOST]:[PORT:8080]/` and the guide explains https through a reverse proxy and `base_url`. A base-path mode can be proposed separately if users ask for the sidebar panel.

### D3. Consistent backups

`backup: cold`: Home Assistant stops the add-on while it copies `/data`, so the SQLite database and its WAL are copied at rest. Tested: the backup holds `opentodo.db` without `-wal`/`-shm` files and a partial restore brings back a deleted task.

### D4. Versions and updates

The add-on's `version` is the OpenTodo release (policy `release` in `deploy/deploy.json` terms): Home Assistant offers an update only when `version` changes and pulls the tag named `version`. A change to the add-on alone gets a fourth number (`0.12.0.1`); Home Assistant's version comparison orders `0.12.0 < 0.12.0.1 < 0.13.0`. The `Dockerfile` names the OpenTodo release separately (`ARG OPENTODO_VERSION`), and the checker requires both to agree with the latest release in `CHANGELOG.md`.

The add-on repository's **Follow OpenTodo** workflow runs daily: when GitHub's latest OpenTodo release (never a pre-release) is newer than the `Dockerfile`'s, it runs `scripts/bump.sh` on a branch, builds and publishes the images from it, and only then moves `main` and tags it, so the store never offers a version whose image is missing. The same script is run here when a release is prepared, so both repositories end up with identical files. Renovate or Dependabot cannot do this alone: a bump must also change `version` and the changelog. Dependabot keeps the actions and the base image current; a new base image ships with the next version.

### D5. Options

Five options, as in the other templates: `base_url` (`url?`), `setup_token` (`password?`, masked in the UI), `allow_signup` (`bool`, default false), `trusted_proxies` (`str?`), `log_level` (`list(debug|info|warn|error)`, default info). Their descriptions in `translations/en.yaml` are the catalogue's. Optional options are left out of `options`, as Home Assistant expects; the start script exports only the ones that are set, so OpenTodo's own defaults apply.

## Size and data

No change to OpenTodo's image, binary or data model. The add-on image is about 115 MB unpacked: Home Assistant's Alpine base with s6-overlay, bashio and jq, plus the 34 MB binary. Runtime memory is OpenTodo's.

## Interface budget

No screen changes.
