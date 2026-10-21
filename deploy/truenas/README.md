# TrueNAS Community Edition app

[`opentodo/`](opentodo/) is a TrueNAS app in the format of TrueNAS's catalogue repository, [`truenas/apps`](https://github.com/truenas/apps), copied from the structure of `ix-dev/community/donetick`:

| File | What it is |
| --- | --- |
| `app.yaml` | Catalogue metadata: version `1.0.0` of the app, `app_version` `0.9.0` (the image tag), category productivity, `run_as_context` 568:568, library `2.3.17` and its hash |
| `ix_values.yaml` | The images: `ghcr.io/pixari/opentodo` tag `"0.9.0"`, and TrueNAS's `container-utils` for the permissions container |
| `questions.yaml` | The install form: Base URL, Setup Token (private), Allow Sign-up, Trusted Proxies, additional variables, user and group (568), Web UI port (30530), storage, labels, resources |
| `templates/docker-compose.yaml` | The Jinja template TrueNAS's library renders: user 568:568, health check `/opentodo healthcheck` (the image has no shell or wget), `OPENTODO_ADDR=:<chosen port>`, `OPENTODO_DATA_DIR=/data`, the data mount, and a permissions container that chowns it to the chosen user |
| `templates/test_values/basic-values.yaml` | What their CI renders and starts |
| `item.yaml` | Generated from `app.yaml` by their `generate_metadata.py` |
| `README.md` | The text on the app's page |

TrueNAS apps listen on the port the user chooses (so the **Host Network** option works), which is why the template sets `OPENTODO_ADDR` from it instead of mapping a port to 8080. The test values choose 8080, the image's own port; the default in the form is 30530, which was free in `truenas/apps` on 17 October 2026 (their `.github/scripts/port_validation.py`).

The image is pinned to a release (`0.9.0`), not `stable`: `truenas/apps` versions every app by its image tag, and their Renovate bot bumps it. `make check` (`scripts/deploy/truenas.mjs`) fails when the tag is not the latest release in `CHANGELOG.md`, when `app_version` differs from it, and on the shared rules in [`../deploy.json`](../deploy.json).

**Status: not yet submitted.**

## Install it now, without the catalogue

TrueNAS 24.10 and later can install a Docker Compose file: **Apps → Discover Apps → ⋮ → Install via YAML**. Paste the compose file from [docs/self-hosting/truenas.md](../../docs/self-hosting/truenas.md) there; it runs the same image with the same settings.

## `upstream/`

[`upstream/ix-dev/community/opentodo/`](upstream/ix-dev/community/opentodo/) is the folder at its path in `truenas/apps`, file for file identical to `opentodo/` (`make check` fails when they drift). Edit `opentodo/`, then copy it:

```bash
rm -rf deploy/truenas/upstream/ix-dev/community/opentodo
cp -R deploy/truenas/opentodo deploy/truenas/upstream/ix-dev/community/opentodo
```

Not kept here: `templates/library/base_v2_3_17/` (about 560 KB of TrueNAS's own Python, generated from `lib_version`) and `templates/rendered/` (ci.py output). `truenas/apps` requires the library to be committed with the app; their `ci.py` (and `devbox run copy-lib`) writes it, so the steps below regenerate it on submission.

## Submitting to truenas/apps (maintainer)

Needs a GitHub account, Docker and Python 3 with `pyyaml psutil pytest pytest-cov bcrypt pydantic` (or `devbox shell` in their repository).

1. Open an issue at [truenas/apps/issues](https://github.com/truenas/apps/issues) proposing OpenTodo for the community train (their PR template asks for one first). Mention the icon and screenshot below.
2. Fork `truenas/apps`, clone your fork and copy the app in:

   ```bash
   git clone https://github.com/<you>/apps && cd apps && git checkout -b opentodo
   cp -R /path/to/opentodo/deploy/truenas/upstream/ix-dev/community/opentodo ix-dev/community/opentodo
   ```

3. Check the port is still unique, then test. `ci.py` vendors the library, writes `lib_version_hash`, regenerates `item.yaml`, renders the template and starts it until it is healthy:

   ```bash
   ./.github/scripts/port_validation.py
   ./.github/scripts/ci.py --app opentodo --train community --test-file basic-values.yaml
   ```

   If the library has a newer version by then (`ls library/`), set `lib_version` in `app.yaml` to it, run `ci.py` again and copy `app.yaml` back here (`lib_version`, `lib_version_hash`). If `port_validation.py` reports a clash, change `PORT_DEFAULT` in `scripts/deploy/truenas.mjs`, the default in `questions.yaml` and the docs.
4. Commit `ix-dev/community/opentodo/` including `templates/library/`, but not `templates/rendered/`. Open the pull request with the title and body in [`upstream/PR.md`](upstream/PR.md), attaching the icon ([`web/public/pwa-512.png`](../../web/public/pwa-512.png), or the SVG [`deploy/coolify/opentodo.svg`](../coolify/opentodo.svg)) and a screenshot ([`docs/images/board-light.webp`](../../docs/images/board-light.webp), converted to PNG).
5. The reviewer uploads the icon (and screenshots) to TrueNAS's CDN and gives the URLs. `app.yaml` already names the usual icon URL, `https://media.sys.truenas.net/apps/opentodo/icons/icon.svg`, as a placeholder: replace it (and `screenshots`) with what they give, run `generate_metadata.py` (it rewrites `item.yaml`), and copy both files back to `opentodo/` and `upstream/` here.
6. Answer review comments, here first, then copy to the fork.

## After a release

Nothing, once the app is accepted: Renovate in `truenas/apps` pins the image digest and bumps the tag, `app_version` and `version` daily, and TrueNAS users see the update in **Apps**. Check that it did; if it misses a release, open a pull request there that changes `tag`, `app_version` and `version` (patch bump).

Here, `make check` fails after every release until the tag follows: set `tag` in `ix_values.yaml` and `app_version` in `app.yaml` to the new version and bump `version` like Renovate does, in both `opentodo/` and `upstream/`.
