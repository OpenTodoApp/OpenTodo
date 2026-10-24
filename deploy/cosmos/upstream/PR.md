# Pull request to azukaar/cosmos-servapps-official

Submitted on 2026-10-24 as [azukaar/cosmos-servapps-official#329](https://github.com/azukaar/cosmos-servapps-official/pull/329). The title and body below are what was submitted, kept as the record of it; later updates to the app are separate pull requests (see ../README.md).

## Title

Add OpenTodo

## Body

Adds **OpenTodo**, an open-source (AGPL-3.0), self-hosted, local-first task manager: projects, labels, due dates, reminders and sharing in the browser and as an installable app that works offline and syncs across devices.

- Source: https://github.com/pixari/opentodo
- Website: https://open-todo.app
- Image: `ghcr.io/pixari/opentodo:stable` (amd64, arm64), the tag the project's release workflow moves to each release (currently 0.11.0)

**What changed:** adds `servapps/OpenTodo/` only (`description.json`, `cosmos-compose.json`, `icon.png` 256×256, `screenshots/1.png` and `2.png`).

**Template**

- One service, data in the named volume `{ServiceName}-data` on `/data`, a SERVAPP route with `useHost` to port 8080, no published ports, `cosmos-force-network-secured` and `cosmos-auto-update`.
- `OPENTODO_BASE_URL` is set from the route (`{RootProtocol}://{Hostnames…host}`), hence `minVersion` 0.22.23.
- The first visitor creates the owner account. `OPENTODO_SETUP_TOKEN={Passwords.0}` protects that step, and the post-install message shows the token with the address; `cosmos-persistent-env` keeps both on reinstall.

**Testing**

- [x] `node .github/scripts/validate-servapps.js OpenTodo` passes with no errors or warnings
- [x] Installed through **ServApps → Import Compose File** on Cosmos 0.23.4 (`azukaar/cosmos-server:0.23.4` in its own Docker-in-Docker daemon on an amd64 host, self-signed HTTPS): the service, volume, network and route were created and the post-install message showed the address and the setup token, which matched the container's `OPENTODO_SETUP_TOKEN`. Opened the route over https: OpenTodo asked for the setup token (a wrong token was refused with 403), created the owner with the right one, added a task. Restarted the container through Cosmos (`/cosmos/api/servapps/<name>/manage/restart`), signed in from a fresh browser session: the task was still there.
- Not tested: installing from the market listing itself (it only exists once merged), and arm64.
