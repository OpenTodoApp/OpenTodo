# Unraid Community Applications template

## Why

Unraid users install containers from Community Applications (CA), which needs an XML template. Issue #4 asks for one. Without it, people hand-build the container in Unraid's Docker tab and guess the settings: the first tester on #4 added `PUID`/`PGID` (which the image ignores) and a base URL without the port, and could not tell whether the problem was permissions. A template with the right defaults and descriptions removes the guessing.

The repository already has one platform template (Coolify, `deploy/coolify/`) and its own check script. Its facts (image, port, `/data`, health check, which variables to offer and their defaults) live inside that script. A second platform would copy them, and the two would drift. Adding a platform should mean adding a template and a small checker, not re-deciding the defaults.

## What Changes

- `deploy/deploy.json`: the deployment facts every platform template must agree on, in one place: image, port, data directory, the image's user, health check command, name, summary, links and icon, and a catalogue of the optional `OPENTODO_*` variables a template may offer, with their default and description, and which ones every template must offer.
- `deploy/unraid/opentodo.xml`: a CA template. Release image line, port 8080, `/mnt/user/appdata/opentodo` on `/data`, Web UI link, icon, overview, category, and the essential optional variables (base URL, setup token, sign-up, trusted proxies) plus a few advanced ones, each with a description; none required.
- `deploy/unraid/upstream/`: the content of the CA template repository `pixari/unraid-templates` (`ca_profile.xml`, `templates/opentodo.xml` as an identical copy, `README.md`, MIT `LICENSE`). CA reads templates from such a repository, and putting `ca_profile.xml` and `templates/` at the app repository's root would clutter it.
- `deploy/unraid/README.md`: how to install from the template before it is listed in CA, how to publish `upstream/` to the template repository, and how the maintainer submits it at ca.unraid.net/submit.
- `scripts/deploy-check.mjs`: one runner that checks every `deploy/<platform>/` with `scripts/deploy/<platform>.mjs`, and fails for a platform folder without a checker. Shared rules (release tag matches the changelog, port, data directory, variables exist in `internal/config` and in the catalogue, defaults agree with the catalogue, essential variables present, nothing required) live in `scripts/deploy/common.mjs`. The Coolify checks stay as they are and gain the shared variable rules. `make check` and CI run the runner.
- `docs/self-hosting/unraid.md`: install, fields, permissions (the image runs as uid 65532; `PUID`/`PGID` do nothing), https and the reverse proxy, plain-http limits, updates and backups. `docs/README.md` lists it.

## Out of scope

- Submitting to Community Applications. The maintainer submits the template repository from their account.
- Publishing to the template repository from CI. That would need a write token for a second repository; publishing is a copy and a push, described in the README.
- Templates for other platforms (TrueNAS, Synology, Portainer, CasaOS, Umbrel). The structure is made for them; each is its own change.
- Changing the image (for example a root entrypoint that honours `PUID`/`PGID`). The image stays rootless.
- The website's install tabs.

ROADMAP: advances self-hosting / easy deployment. No ROADMAP item names this change. No new mandatory environment variable; no op log change.

## Impact

- New: `deploy/deploy.json`, `deploy/unraid/`, `scripts/deploy-check.mjs`, `scripts/deploy/`, `docs/self-hosting/unraid.md`.
- Changed: `scripts/coolify-template-check.mjs` (shared helpers come from `scripts/deploy/common.mjs`), `Makefile`, `.github/workflows/ci.yml`, `docs/README.md`, `CHANGELOG.md`.
- No server, client, image or data change.
