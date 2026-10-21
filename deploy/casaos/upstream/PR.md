# Pull request for IceWhaleTech/CasaOS-AppStore

Open it from a branch of your fork against `main`, after copying `Apps/OpenTodo/` (see ../README.md, "Submitting"). Tick or edit the Testing lines only for what you actually did.

## Title

```
Add OpenTodo
```

## Body (paste everything below the line)

---

**New app:** OpenTodo, an open-source (AGPL-3.0), self-hosted, local-first task manager: projects, labels, due dates, reminders and sharing in the browser and as an installable app, with offline changes synced across devices.

- Website: https://open-todo.app
- Source: https://github.com/pixari/opentodo
- Image: `ghcr.io/pixari/opentodo:0.9.0` (amd64, arm64; published by the project's release workflow)

**What changed:** adds `Apps/OpenTodo/` only: `docker-compose.yml`, `icon.svg`, `icon.png`, `thumbnail.png` and two screenshots.

**Notes on the compose file**

- One web service, `opentodo`, on container port 8080, published as `8418` (`port_map`), category Productivity.
- Data in `/DATA/AppData/$AppID/data`. The image is distroless and runs as uid 65532 without a shell, so a pinned `busybox` one-shot service (`opentodo-init`, `network_mode: none`) runs `chown -R 65532:65532 /data` and the app waits for it with `service_completed_successfully`, as `Apps/OpenClaw` does.
- No required variables. The first visitor creates the owner account; the optional `OPENTODO_SETUP_TOKEN` (explained in `tips.before_install` and the env description) protects that step on servers reachable from the internet.
- Health check: `/opentodo healthcheck` (the image has no shell or curl).
- We will send a version bump PR for every release.

**How it was validated**

- [ ] `python3 .github/actions/validate-compose/scripts/validate_compose.py --app-path OpenTodo` passes (including `docker compose config -q`)
- [ ] The store build (`build_appstore.py`) builds the app without warnings
- [ ] Installed as a custom app on CasaOS / ZimaOS: opened from the dashboard, created the owner account, added a task, restarted the app, the task was still there
