# Home Assistant add-on

Home Assistant OS and Supervised installations run add-ons (Home Assistant now calls them apps) from add-on repositories that anyone can add by URL. OpenTodo has its own: **[`pixari/opentodo-homeassistant-addons`](https://github.com/pixari/opentodo-homeassistant-addons)**, with one add-on, `opentodo`. Home Assistant Container and Core have no add-ons; those users run the Docker image next to Home Assistant ([docs/self-hosting/docker.md](../../docs/self-hosting/docker.md)).

[`upstream/`](upstream/) is the repository's whole content, file for file:

| Path | What it is |
| --- | --- |
| `repository.yaml` | The repository's name, URL and maintainer |
| `opentodo/config.yaml` | The add-on: slug `opentodo`, `version` = the OpenTodo release, `image: ghcr.io/pixari/opentodo-homeassistant` (the Supervisor pulls the tag named `version`), `arch` amd64 and aarch64, port 8080 with `webui`, `backup: cold`, and five options: `base_url`, `setup_token` (a password field), `allow_signup`, `trusted_proxies`, `log_level` |
| `opentodo/Dockerfile` | `FROM ghcr.io/home-assistant/base` (Alpine with s6 and bashio), the binary copied from `ghcr.io/pixari/opentodo:<OPENTODO_VERSION>`, `OPENTODO_DATA_DIR=/data`, the health check |
| `opentodo/run.sh` | Reads `/data/options.json` (written by the Supervisor before every start) and exports the matching `OPENTODO_*` variables, then runs OpenTodo |
| `opentodo/translations/en.yaml` | The option names, with the catalogue's descriptions from `deploy/deploy.json` |
| `opentodo/apparmor.txt` | OpenTodo runs in its own AppArmor profile: its binary, `/data`, the network and a few system files |
| `opentodo/DOCS.md`, `README.md`, `CHANGELOG.md`, `icon.png` (128×128), `logo.png` | What Home Assistant shows on the add-on's tabs |
| `.github/workflows/build.yaml` | Builds amd64 and aarch64 images with Home Assistant's builder actions and publishes `ghcr.io/pixari/{amd64,aarch64}-opentodo-homeassistant` and the multi-arch `ghcr.io/pixari/opentodo-homeassistant`; an existing tag is never rebuilt (`skip-existing`) |
| `.github/workflows/test.yaml` | Home Assistant's add-on linter, ShellCheck, and a start of the image with an `options.json` that checks the options reach OpenTodo |
| `.github/workflows/follow.yaml`, `scripts/bump.sh` | Follows OpenTodo's releases (below) |
| `.github/dependabot.yml` | GitHub Actions and the base image |
| `LICENSE`, `README.md`, `.gitignore` | AGPL-3.0 like OpenTodo; install steps |

`make check` (`scripts/deploy/homeassistant.mjs`) checks the file list, the add-on fields, that every option maps to its `OPENTODO_*` variable in `run.sh` with the catalogue's default and description, the release in the `Dockerfile` and `version`, the images and the repository file.

## Decisions

- **Own image on Home Assistant's base, not OpenTodo's image.** OpenTodo's image is distroless: no shell to turn the add-on options into variables, and it runs as user 65532 while the Supervisor creates `/data` owned by root. The add-on image adds the static binary (about 34 MB) to the Alpine base and runs it as root, like other add-ons, in its own AppArmor profile.
- **No Ingress (sidebar panel).** Ingress serves an add-on under `/api/hassio_ingress/<token>/` on Home Assistant's own address. OpenTodo's pages load `/assets/…`, call `/api/v1/…` and register a service worker for `/`, all at the root; through a proxy that strips that prefix the page stays blank (every script and stylesheet answered 404, tested with OpenTodo 0.12.0). Passkeys, secure cookies and the installed app are also tied to OpenTodo's own address. Serving under a runtime prefix would touch the router, every API call, the service worker scope, the manifest, the cookie path and the Content-Security-Policy: a larger change, left as a possible follow-up. The add-on publishes port 8080 with **Open Web UI** instead; https comes from a reverse proxy, and `base_url` names it.
- **`backup: cold`.** Home Assistant stops the add-on while it copies `/data`, so the SQLite database in the backup is consistent; OpenTodo is unavailable for those seconds.
- **Version = OpenTodo release.** An add-on-only change gets a fourth number (`0.12.0.1`); Home Assistant orders `0.12.0 < 0.12.0.1 < 0.13.0`.

## On a release

Nothing to do by hand. The **Follow OpenTodo** workflow runs every morning (and on **Run workflow**): when GitHub's latest OpenTodo release (never a release candidate) is newer than `OPENTODO_VERSION` in the `Dockerfile`, it runs `scripts/bump.sh <version>` on a branch (`OPENTODO_VERSION`, `version`, a changelog entry), builds and publishes the images from it, then moves `main` there and tags `v<version>`. Home Assistant offers the update once it refreshes the store, and never before the image exists.

Then bring the same change back here, because `make check` requires the latest release from `CHANGELOG.md`: run `deploy/homeassistant/upstream/scripts/bump.sh <version>` in this repository (it writes the same lines as the workflow). When preparing a release, running it here first is fine too: the workflow's bump will match.

## Publishing a change to the add-on

Edit the add-on here, never in the add-on repository, then copy `upstream/` over a clone and push:

```bash
git clone https://github.com/pixari/opentodo-homeassistant-addons /tmp/opentodo-ha
cp -R deploy/homeassistant/upstream/. /tmp/opentodo-ha/
cd /tmp/opentodo-ha && git add -A && git commit -m "OpenTodo add-on: <what changed>" && git push
```

A change that affects the image (`Dockerfile`, `run.sh`) needs a new version, `0.12.0.1` and so on, with a changelog entry: the build never replaces a published version. A change to `config.yaml`, the docs or `apparmor.txt` reaches users when they refresh the store.

## Listing elsewhere

Home Assistant has no central store for third-party add-ons: people add the repository URL (the README's **Add repository** button does it in one click). The add-on is not proposed for [`home-assistant/addons`](https://github.com/home-assistant/addons) (official add-ons only) or the [Home Assistant Community Add-ons](https://github.com/hassio-addons) project (add-ons maintained by that team). The one place worth an announcement is the community forum's **Share your Projects** category; nothing has been posted there yet.
