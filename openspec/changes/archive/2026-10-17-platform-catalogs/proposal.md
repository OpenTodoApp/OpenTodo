# Templates for eight more self-hosting platforms

## Why

Unraid's Community Applications listing showed how much a one-click entry in a platform's own catalog helps people find and install OpenTodo. The maintainer wants the same on the other popular self-hosting platforms. The `deploy/` structure (shared facts, one checker per platform, upstream copies) was built for this: each platform is a folder, a checker and a guide.

## What Changes

New platforms, each in `deploy/<platform>/` with its template in the platform's own format, an `upstream/` copy laid out as the target repository expects (when there is one), a checker `scripts/deploy/<platform>.mjs` with tests, a guide `docs/self-hosting/<platform>.md` and submission notes:

| Platform | Where it goes | Image |
| --- | --- | --- |
| CasaOS / ZimaOS | PR to IceWhaleTech/CasaOS-AppStore | release version (the store pins digests and updates on a version bump) |
| Umbrel | PR to getumbrel/umbrel-apps | release version and index digest (required by their linter) |
| TrueNAS Community Edition | PR to truenas/apps (community train) | release version (their Renovate bumps it afterwards) |
| Runtipi | our own app store repository (the official store takes no new apps) | release version (Renovate in that repository bumps it) |
| Dokploy | PR to Dokploy/templates | `stable` |
| Easypanel | PR to easypanel-io/templates | release version (their rules forbid moving tags) |
| Portainer | a template URL served from this repository, listed in Lissy93/portainer-templates | `stable` |
| Cosmos Cloud | PR to azukaar/cosmos-servapps-official | `stable` |

- The shared image rule gains a per-platform policy: `stable` (default), `release` (the latest release in `CHANGELOG.md`) or `release-digest` (that release plus its multi-arch index digest). Stores that refuse moving tags use the latter two, so preparing a release fails the check until those templates name the new version.
- `scripts/deploy/pin.mjs` refreshes the pinned digests from the registry after a release (`--check` reports stale ones).
- `deploy/README.md` lists every platform with its status and what a release requires.

Not **BREAKING**: no server, client, image, environment variable or op log change.

## Out of scope

- Proxmox VE community scripts: their rules require 600 to 1,000 GitHub stars and a project at least six months old; revisit then.
- YunoHost: a native (non-Docker) package in its own repository, which their reviewers expect a maintainer to own line by line; a separate change.
- Submitting to the stores: the maintainer submits from their account (forks, PRs, store forms), with the notes in each folder.
- Automating the per-release upstream PRs.

ROADMAP: advances self-hosting / easy deployment. No ROADMAP item names this change.

## Impact

- New: `deploy/{casaos,umbrel,truenas,runtipi,dokploy,easypanel,portainer,cosmos}/`, `scripts/deploy/<platform>.mjs` and tests, `scripts/deploy/pin.mjs`, `docs/self-hosting/<platform>.md`.
- Changed: `scripts/deploy/common.mjs`, `deploy/README.md`, `docs/README.md`, `README.md`, `CHANGELOG.md`, `Makefile` (deploy tests glob).
