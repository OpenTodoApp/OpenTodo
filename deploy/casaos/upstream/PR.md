# Pull request to IceWhaleTech/CasaOS-AppStore

Submitted on 2026-10-24 as [IceWhaleTech/CasaOS-AppStore#1104](https://github.com/IceWhaleTech/CasaOS-AppStore/pull/1104). The title and body below are what was submitted, kept as the record of it; later updates to the app are separate pull requests (see ../README.md).

## Title

Add OpenTodo 0.11.0

## Body

**New app:** OpenTodo, an open-source (AGPL-3.0), self-hosted, local-first task manager: projects, labels, due dates, reminders and sharing in the browser and as an installable app, with offline changes synced across devices.

- Website: https://open-todo.app
- Source: https://github.com/pixari/opentodo
- Image: `ghcr.io/pixari/opentodo:0.11.0` (amd64, arm64; published by the project's release workflow)

**What changed:** adds `Apps/OpenTodo/` only: `docker-compose.yml`, `icon.svg`, `icon.png`, `thumbnail.png` and two screenshots.

**Notes on the compose file**

- One web service, `opentodo`, on container port 8080, published as `8418` (`port_map`; not used by any other app in the store), category Productivity, id `app.open-todo.opentodo` (the project's domain is open-todo.app).
- Data in `/DATA/AppData/$AppID/data`. The image is distroless and runs as uid 65532 without a shell, so a pinned `busybox` one-shot service (`opentodo-init`, `network_mode: none`) runs `chown -R 65532:65532 /data` and the app waits for it with `service_completed_successfully`, similar to `Apps/OpenClaw`.
- No required variables. The first visitor creates the owner account; the optional `OPENTODO_SETUP_TOKEN` (explained in `tips.before_install` and the env description) protects that step on servers reachable from the internet.
- Health check: `/opentodo healthcheck` (the image has no shell or curl).
- We will send a version bump PR for every release.

**How it was validated**

- [x] `python3 .github/actions/validate-compose/scripts/validate_compose.py --app-path OpenTodo` passes with no errors or warnings (including `docker compose config -q`)
- [x] `./scripts/build_dist.sh` (build-appstore-action v1.1.2) builds the whole store; `app.open-todo.opentodo` is listed as OK, with `docker-compose.amd64.yml` and `docker-compose.arm64.yml` pinned to the per-architecture digests and the assets converted
- [x] Installed as a custom app on CasaOS 0.4.15 (the `dockurr/casa` container, running against its own Docker-in-Docker daemon on an amd64 host), posting this `docker-compose.yml` to CasaOS's app management API (`POST /v2/app_management/compose`): `opentodo-init` ran and exited 0, the data folder was owned by 65532, `opentodo` became healthy and appeared on the CasaOS dashboard. Opened the app on port 8418, created the owner account and added a task; restarted the app through CasaOS (`PUT /v2/app_management/compose/opentodo/status`, `restart`), the init service ran again, and after signing in from a fresh browser session the task was still there.
- [ ] Not tested on ZimaOS or on arm64 hardware. The dashboard showed the default icon during the test because the `icon` URL (jsDelivr, this repository) only resolves once the folder is merged.
