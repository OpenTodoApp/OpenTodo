# Home Assistant add-on

## Why

Many people who self-host start with Home Assistant OS on a Raspberry Pi or a small PC. On that system the easy way to run another server is an add-on (Home Assistant now calls them apps), installed from an add-on repository by URL. OpenTodo has templates for every common container platform but none for Home Assistant, so those users have to run Docker beside a system that does not offer it.

## What Changes

- A new repository, `pixari/opentodo-homeassistant-addons`, with one add-on, `opentodo`, published from `deploy/homeassistant/upstream/` in this repository (like the Runtipi store).
- The add-on image, `ghcr.io/pixari/opentodo-homeassistant` for amd64 and aarch64, is Home Assistant's base image with the OpenTodo binary copied from the released image, built and published by that repository's workflow; a published version is never rebuilt.
- Options mirror the essential variables of `deploy/deploy.json` (base URL, setup token, sign-up, trusted proxies) plus the log level, with the catalogue's defaults and descriptions; a start script turns them into `OPENTODO_*` variables. The data is in the add-on's `/data`, included in Home Assistant backups (`backup: cold`).
- Access through a published port and **Open Web UI**, not Ingress: OpenTodo is served at the root of its own address (design D2).
- The add-on's version is the OpenTodo release; a workflow in the add-on repository follows OpenTodo's releases and publishes the update before Home Assistant can offer it.
- `scripts/deploy/homeassistant.mjs` with tests, `deploy/homeassistant/README.md`, `docs/self-hosting/home-assistant-addon.md`, table rows in `deploy/README.md`, `docs/README.md` and the README, a CHANGELOG entry.

Not **BREAKING**: no server, client, image, environment variable or op log change.

## Out of scope

- Serving OpenTodo under a path prefix (Ingress); recorded as a possible follow-up in design D2.
- Submitting to `home-assistant/addons` (official add-ons only) or the Home Assistant Community Add-ons project; a community forum post is prepared, not posted.
- The Home Assistant integration (to-do entities), which is a separate repository and guide (`docs/home-assistant.md`).

ROADMAP: section 6, Integrations and data ownership (new row `homeassistant-addon`).

## Impact

- New: `deploy/homeassistant/`, `scripts/deploy/homeassistant.mjs` and its tests, `docs/self-hosting/home-assistant-addon.md`.
- Changed: `deploy/README.md`, `docs/README.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md`.
