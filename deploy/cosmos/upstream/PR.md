# Pull request for azukaar/cosmos-servapps-official

Open it from a branch of your fork against `master`, after copying `servapps/OpenTodo/` (see ../README.md, "Submitting"). Tick the Testing lines only for what you actually did.

## Title

```
Add OpenTodo
```

## Body (paste everything below the line)

---

Adds **OpenTodo**, an open-source (AGPL-3.0), self-hosted, local-first task manager: projects, labels, due dates, reminders and sharing in the browser and as an installable app that works offline and syncs across devices.

- Source: https://github.com/pixari/opentodo
- Image: `ghcr.io/pixari/opentodo:stable` (amd64, arm64), the tag the project's release workflow moves to each release

**What changed:** adds `servapps/OpenTodo/` only (`description.json`, `cosmos-compose.json`, `icon.png`, two screenshots).

**Template**

- One service, data in the named volume `{ServiceName}-data` on `/data`, a SERVAPP route with `useHost` to port 8080, no published ports, `cosmos-force-network-secured` and `cosmos-auto-update`.
- `OPENTODO_BASE_URL` is set from the route (`{RootProtocol}://{Hostnames…host}`), hence `minVersion` 0.22.23.
- The first visitor creates the owner account. `OPENTODO_SETUP_TOKEN={Passwords.0}` protects that step, and the post-install message shows the token with the address; `cosmos-persistent-env` keeps both on reinstall.

**Testing**

- [ ] `node .github/scripts/validate-servapps.js OpenTodo` passes
- [ ] Installed through **Import Compose File** on Cosmos (version: ...): created the owner with the setup token, added a task, restarted the container, the task was still there
