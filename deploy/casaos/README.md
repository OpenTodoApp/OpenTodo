# CasaOS / ZimaOS app store template

[`docker-compose.yml`](docker-compose.yml) is an app for the CasaOS / ZimaOS app store ([IceWhaleTech/CasaOS-AppStore](https://github.com/IceWhaleTech/CasaOS-AppStore)): a Docker Compose file with the store's `x-casaos` metadata. It runs the latest release by version (`ghcr.io/pixari/opentodo:0.9.0`, the store refuses moving tags), publishes the web port 8080 as 8418 on the server, keeps the data in `/DATA/AppData/$AppID/data` on `/data`, and offers the base URL, setup token, sign-up and trusted proxies settings with the catalogue's descriptions. No setting is required. A pinned `busybox` one-shot service (`opentodo-init`) runs `chown -R 65532:65532 /data` before OpenTodo starts, because Docker creates the bind folder owned by root and the image has no shell (the store's OpenClaw app does the same). The facts it shares with the other templates are in [`../deploy.json`](../deploy.json); `make check` keeps them in line ([`../README.md`](../README.md)).

**Status: not yet submitted.** The steps for users, including installing it now as a custom app, are in [docs/self-hosting/casaos.md](../../docs/self-hosting/casaos.md).

## Install it now, without the store

In the CasaOS or ZimaOS dashboard: **App Store → Custom Install → Import**, pick or paste `docker-compose.yml`, check the settings and install. The custom app behaves like the store's, except that it never offers updates; change its image tag to update it.

## The store folder

The store takes one folder per app. [`upstream/Apps/OpenTodo/`](upstream/Apps/OpenTodo/) is that folder, file for file:

| File | What it is |
| --- | --- |
| `docker-compose.yml` | An identical copy of [`docker-compose.yml`](docker-compose.yml) |
| `icon.svg` | An identical copy of [`../coolify/opentodo.svg`](../coolify/opentodo.svg) (`x-casaos.icon`) |
| `icon.png` | 256x256, from `web/public/pwa-512.png` |
| `thumbnail.png` | 1176x663, the Today screen (`docs/images/today-light.webp`), cropped |
| `screenshot-1.png`, `screenshot-2.png` | 1280 wide, the Today and board screens (`docs/images/today-light.webp`, `board-light.webp`) |

The asset URLs in `x-casaos` point at `https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@main/Apps/OpenTodo/`, where the files are served once the pull request is merged; the store build copies them into its own output. The assets live only in `upstream/` (the template itself names them by URL). `node scripts/deploy-check.mjs` (`scripts/deploy/casaos.mjs`) fails when the copy differs, a file is missing or extra, the icon differs from the logo, or a PNG has the wrong size.

To regenerate the PNGs (Pillow):

```bash
python3 - <<'EOF'
from PIL import Image
d = 'deploy/casaos/upstream/Apps/OpenTodo/'
Image.open('web/public/pwa-512.png').convert('RGBA').resize((256, 256), Image.LANCZOS).save(d + 'icon.png', optimize=True)
def shot(name):
    im = Image.open(f'docs/images/{name}.webp').convert('RGB')
    return im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
shot('today-light').save(d + 'screenshot-1.png', optimize=True)
shot('board-light').save(d + 'screenshot-2.png', optimize=True)
im = Image.open('docs/images/today-light.webp').convert('RGB')
im.crop((0, 0, im.width, round(im.width * 663 / 1176))).resize((1176, 663), Image.LANCZOS).save(d + 'thumbnail.png', optimize=True)
EOF
```

## Submitting (maintainer)

1. Test first on a CasaOS or ZimaOS machine: custom-install `docker-compose.yml`, open the app from the dashboard, create the owner, add a task, restart the app and check the task is still there.
2. Fork [IceWhaleTech/CasaOS-AppStore](https://github.com/IceWhaleTech/CasaOS-AppStore) with your GitHub account and clone the fork.
3. Copy the folder and run the store's checks (Python 3 with PyYAML, and Docker for `docker compose config`):

   ```bash
   cp -R deploy/casaos/upstream/Apps/OpenTodo /path/to/CasaOS-AppStore/Apps/
   cd /path/to/CasaOS-AppStore
   python3 .github/actions/validate-compose/scripts/validate_compose.py --app-path OpenTodo --report-json /tmp/report.json
   ./scripts/build_dist.sh   # optional: the full store build (downloads the build script, queries registries)
   ```

4. Commit on a branch (`git checkout -b add-opentodo && git add Apps/OpenTodo && git commit -m "Add OpenTodo"`), push to the fork and open a pull request against `main` with the title and body in [`upstream/PR.md`](upstream/PR.md). Their **Validate Compose And Build** workflow checks it; a store maintainer reviews and merges.

## After a release

The store only offers an update when `x-casaos.version` changes (it pins image digests itself at build time), so every release needs a small pull request to the store. `make check` fails after a release until this file is bumped, since the image must name the latest release in `CHANGELOG.md`:

1. In [`docker-compose.yml`](docker-compose.yml) change the image tag and `x-casaos.version` to the new version, set `update_at` to the release date and rewrite `release_notes` (one line and the changelog link).
2. Copy it to `upstream/Apps/OpenTodo/docker-compose.yml` and run `node scripts/deploy-check.mjs`.
3. Copy `upstream/Apps/OpenTodo/docker-compose.yml` into your fork of the store, commit (`Update OpenTodo to <version>`) and open a pull request.

Release candidates are never put in the store.
