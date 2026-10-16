# Design: Unraid template and shared deployment facts

## Context

`deploy/coolify/` holds the only platform template, checked by `scripts/coolify-template-check.mjs`, which hard-codes the image, port and the rules for variables. Issue #4 adds Unraid; more platforms are likely (TrueNAS, Synology, Portainer, CasaOS, Umbrel). Each has its own format (YAML compose with header comments, CA XML, app catalog JSON), so one generator for all of them would be more machinery than the templates themselves.

## Decisions

### D1. Facts in one file, templates written by hand, checks bind them

`deploy/deploy.json` holds what must not differ between platforms. Templates stay hand-written in each platform's native format (upstream catalogs review the file itself, and Coolify's copy must stay byte-identical to what is submitted). The check reads each template and compares it with the facts. Generation was considered and rejected: it would hide the file reviewers actually read and needs a writer per format anyway.

### D2. One runner, one checker per platform

`scripts/deploy-check.mjs` lists the folders of `deploy/` and imports `scripts/deploy/<folder>.mjs`, which exports `check(facts, root)` returning a list of problems. A folder without a checker fails the run, so a new platform cannot ship unchecked. `scripts/deploy/common.mjs` provides the shared rules; a platform checker parses its format and calls them with what it found: the image reference, the container port, the data target, and the variables with their defaults.

### D3. The variable catalogue

Each entry: `name`, `default`, `description`, and flags `essential` (every template must offer it), `secret` (masked in UIs that support it) and `platformDefault` (the platform fills the value, so its default is not compared: Coolify's base URL from the service domain, its generated setup token). Rules: every `OPENTODO_*` in a template is in the catalogue; every catalogue name is read by `internal/config`; a template's default equals the catalogue default unless `platformDefault`; essential entries appear in every template; no template makes a variable required.

### D4. Unraid specifics

- CA XML `Container version="2"`, `Network` bridge, not privileged, `WebUI` `http://[IP]:[PORT:8080]/`, `TemplateURL` raw on `main` of the template repository (D6), `Icon` the app's `pwa-512.png` raw on `main`, category `Productivity: Tools:`.
- Port 8080 (Type Port, tcp), data path `/mnt/user/appdata/opentodo` on `/data` (Type Path, rw), both shown and required (they are not environment variables).
- The image keeps running as uid 65532: Unraid user shares are world-writable by default, which is what the tester on #4 had, and it signed up fine. The docs say what to do when a path is not writable (`chown 65532:65532`, or `--user 99:100` in Extra Parameters to match Unraid's nobody:users), and that `PUID`/`PGID` are ignored.
- `OPENTODO_BASE_URL` is empty by default: on a LAN address the server works without it. Its description says to set it to the https address behind a reverse proxy, with the port if there is one.
- `OPENTODO_SETUP_TOKEN` empty and masked: optional on a home network, recommended when the server is reachable from the internet.

### D5. Release tag

All templates name the release line (`0.6`), checked against the latest release in `CHANGELOG.md` by the shared rule, so preparing a release fails the check until every template is bumped.

### D6. A separate template repository, published from `upstream/`

CA lists apps from template repositories registered through ca.unraid.net/submit: `ca_profile.xml` at the root, one XML per app under `templates/`, an OSI-approved license, and each template's `TemplateURL` pointing at its own raw file. Using the app repository would put `ca_profile.xml` and `templates/` at its root. So the template repository is `pixari/opentodo-unraid`, and `deploy/unraid/upstream/` holds its content file for file, like Coolify's `upstream/`. The source of truth stays `deploy/unraid/opentodo.xml`; the check requires the copy to be identical and the profile to exist. Publishing is a manual copy and push: automating it would need a write token for a second repository, a secret this project does not otherwise need.

## Size and data

No image, binary, runtime or data model change. The check scripts have no dependencies (Node standard library, a strict parser for the XML subset CA templates use).

## Interface budget

No screen changes.
