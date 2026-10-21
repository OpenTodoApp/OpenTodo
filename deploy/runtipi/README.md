# Runtipi app

Runtipi's official app store ([`runtipi/runtipi-appstore`](https://github.com/runtipi/runtipi-appstore)) no longer accepts new apps, so OpenTodo ships its own app store: a repository made from Runtipi's template [`runtipi/example-appstore`](https://github.com/runtipi/example-appstore), to be published as **`pixari/opentodo-runtipi`**. Runtipi users add it under **Settings → App Stores → Add App Store**.

The app, in Runtipi's native format (Runtipi 4.7.0 or newer):

- [`config.json`](config.json): id `opentodo`, port 8400 (the host port when the user opens one), category `utilities`, `exposable` (a domain with https through Runtipi's Traefik), `version` = the release, `tipi_version` (raised on every change users should get), and four optional form fields: base URL, setup token, open sign-up, trusted proxies.
- [`docker-compose.yml`](docker-compose.yml): the `opentodo` service (the key is the app id; `x-runtipi.is_main`, `internal_port: 8080`) with the **release tag** (`ghcr.io/pixari/opentodo:0.9.0`; Runtipi's store test wants the tag to contain `version`), the health check, `${APP_DATA_DIR}/data` on `/data` and the form fields as `OPENTODO_*` with their defaults; and `opentodo-init`, a one-shot `busybox` that runs `chown -R 65532:65532 /data` before OpenTodo starts. Runtipi creates the data folder owned by root and only makes it writable (`chmod a+rwx`) after the first `compose up`, so without it the first start fails with `open /data/opentodo.lock: permission denied`. `restart: "no"` keeps Runtipi's default `unless-stopped` from restarting it after it finishes.
- [`metadata/description.md`](metadata/description.md) and [`metadata/logo.jpg`](metadata/logo.jpg) (512×512, from `web/public/pwa-512.png`).

**Status: not yet published.** The store repository does not exist yet.

## The store repository

[`upstream/`](upstream/) is the repository's whole content, file for file:

| Path | What it is |
| --- | --- |
| `apps/opentodo/` | Identical copies of the files above |
| `__tests__/apps.test.ts` | The store's checks, after Runtipi's own: required files, `config.json` against `@runtipi/common`'s schema, the compose file against Runtipi 4.7's native-compose shape (restated, because `@runtipi/common` 1.1.3 on npm still ships an older draft), service key = id, one main service, image tag contains `version`, past timestamps, unique ports and ids |
| `scripts/update-config.ts`, `scripts/__tests__/` | Run by Renovate after it changes an image: raises `tipi_version` and `updated_at`, and sets `version` only when the main (OpenTodo) image changed |
| `renovate.json`, `config.js`, `.github/workflows/renovate.yml` | Renovate, run nightly on GitHub Actions (self-hosted, as in the template) |
| `.github/workflows/test.yml` | `bun install --frozen-lockfile && bun test` on pushes and pull requests |
| `package.json`, `bun.lock`, `tsconfig.json`, `.gitignore`, `README.md`, `LICENSE` (MIT) | The rest of the template, adapted |

The template still tests `docker-compose.json` files and its Renovate rule only matches those, although its own app moved to `docker-compose.yml`; both are adapted here. `make check` (`scripts/deploy/runtipi.mjs`) checks the app, the copies and that Renovate's pattern finds both images. To run the store's own tests: `cd deploy/runtipi/upstream && bun install && bun test` (do not commit `node_modules/`).

Edit the app here, never in the store repository. To publish, copy `upstream/` over the repository's content and push:

```bash
git clone https://github.com/pixari/opentodo-runtipi /tmp/opentodo-runtipi
cp -R deploy/runtipi/upstream/. /tmp/opentodo-runtipi/
cd /tmp/opentodo-runtipi && git add -A && git commit -m "OpenTodo app: <what changed>" && git push
```

## Publishing (maintainer)

1. Create the repository from the template: on [`runtipi/example-appstore`](https://github.com/runtipi/example-appstore) click **Use this template → Create a new repository**, owner `pixari`, name `opentodo-runtipi`, public. (An empty public repository works too: the content comes from `upstream/`.)
2. Clone it, delete the template's files (`apps/whoami`, `bun.lockb`), copy `upstream/` over it as above, commit and push to `main`. The Test workflow must pass.
3. In the repository's **Settings → Actions → General**, allow GitHub Actions to **create and approve pull requests** (Renovate opens its pull requests with the workflow's token), then run the Renovate workflow once by hand (**Actions → Renovate → Run workflow**) and check its log.
4. Test on Runtipi 4.7 or newer: add the store, install OpenTodo, open it, create the owner, add a task, restart the app and check the task is still there, then try exposing it with a domain and setting **Base URL**. This has not been done on a real Runtipi yet (the compose file was only run with Docker Compose the way Runtipi runs it).
5. Add the row to the platform table in `deploy/README.md` and the page to `docs/README.md`.

## On a release

Nothing to change by hand. The Renovate workflow runs every night: when the new image is published it opens a pull request in the store repository that changes the tag in `apps/opentodo/docker-compose.yml`, and runs `scripts/update-config.ts` (new `version`, `tipi_version + 1`, `updated_at`) and the store tests. Review and merge it; Runtipi shows the update once it refreshes its app stores. Then bring the same change back here (tag, `version`, `tipi_version`, `updated_at` in `deploy/runtipi/`, and `upstream/`), because `make check` here requires the latest release in CHANGELOG.md. Renovate ignores release candidates (their tags have a suffix) and the `stable`, `latest` and `0.6` tags. It also proposes new `busybox` releases; those raise `tipi_version` but not `version`.

Renovate's post-upgrade commands (`update-config.ts`) only run in this self-hosted setup: installing the hosted Mend Renovate GitHub app instead would open pull requests that change the tag but not `config.json`, which the store tests then refuse. Do not install both.
