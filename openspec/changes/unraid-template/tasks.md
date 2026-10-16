# Tasks

## 1. Shared facts and runner

- [x] 1.1 Add `deploy/deploy.json` (image, port, data directory, user, health check, name, summary, links, icon, variable catalogue with defaults, descriptions and the essential, secret and platformDefault flags). Verify: `node --test scripts/deploy/common.test.mjs` checks that every catalogue name is read by `internal/config`.
- [x] 1.2 Add `scripts/deploy/common.mjs` (load facts, latest release, config variables, release-tag, port, data and variable rules) and `scripts/deploy-check.mjs` (one checker per `deploy/<platform>/`, a folder without one fails). Verify: `node --test scripts/deploy/*.test.mjs` covers a stale tag, a wrong port, an unknown variable, a wrong default, a missing essential variable, a required variable and a platform folder without a checker.
- [x] 1.3 `scripts/deploy/coolify.mjs`: the existing Coolify checks plus the shared variable rules; `scripts/coolify-template-check.mjs` imports the shared helpers. Verify: `node --test scripts/coolify-template-check.test.mjs` still passes and `node scripts/deploy-check.mjs` reports Coolify ok.

## 2. Unraid

- [x] 2.1 Add `deploy/unraid/opentodo.xml` and `scripts/deploy/unraid.mjs` (strict parser for the CA XML subset; required elements, port, path, Web UI, icon file present, category, no required variable). Verify: `node scripts/deploy-check.mjs` reports Unraid ok, and its tests cover a missing path, a wrong port and a required variable.
- [x] 2.2 Add `deploy/unraid/README.md`: install from the template URL before the CA listing, and the maintainer's CA submission steps. Verify: links in it resolve to files in the repository.
- [x] 2.4 Add `deploy/unraid/upstream/` (the template repository: `ca_profile.xml`, `templates/opentodo.xml`, `README.md`, `LICENSE`), point `TemplateURL` at `pixari/unraid-templates`, and check the copy is identical and the profile present. Verify: `node --test scripts/deploy/*.test.mjs` covers a differing copy and a missing profile.
- [x] 2.3 Start the image the way the template does (port mapping, appdata bind mount, the template's environment) and check the container is healthy, the first visitor can create the owner and a task added in a browser over plain http on the host's network address is saved. Verify: recorded in `notes.md`.

## 3. Wiring and docs

- [x] 3.1 `make deploy-check` (in `make check`, replacing `coolify-check` there) and the CI job run the runner and the tests. Verify: `make check` locally; CI green.
- [x] 3.2 `docs/self-hosting/unraid.md` (install, fields, permissions and `PUID`/`PGID`, https and reverse proxy, plain-http limits, updates, backups), listed in `docs/README.md`; `CHANGELOG.md` entry. Verify: `cd web && node scripts/docs/build.mjs && node scripts/docs/check.mjs`.
- [x] 3.3 `npx @fission-ai/openspec validate --all --strict`.
