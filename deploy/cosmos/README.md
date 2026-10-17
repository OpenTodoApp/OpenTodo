# Cosmos Cloud market servapp

[`cosmos-compose.json`](cosmos-compose.json) and [`description.json`](description.json) are a servapp for the official Cosmos Cloud market ([azukaar/cosmos-servapps-official](https://github.com/azukaar/cosmos-servapps-official)). The compose template runs the `stable` image (every release moves it) with Cosmos's auto-update on, keeps the data in a named volume `{ServiceName}-data` on `/data`, and serves the web port 8080 through a Cosmos route on the hostname the user picks (no published port, network secured). Cosmos fills in `OPENTODO_BASE_URL` from that route (`{RootProtocol}://{Hostnames…host}`, so `minVersion` is `0.22.23`) and generates `OPENTODO_SETUP_TOKEN` (`{Passwords.0}`, 24 characters), which the post-install message shows next to the address. Sign-up stays closed and trusted proxies empty. The `cosmos-persistent-env` label keeps the base URL and setup token when the servapp is reinstalled over itself. The facts it shares with the other templates are in [`../deploy.json`](../deploy.json); `make check` keeps them in line ([`../README.md`](../README.md)).

**Status: not yet submitted.** The steps for users, including installing it now as a custom compose, are in [docs/self-hosting/cosmos.md](../../docs/self-hosting/cosmos.md).

## Install it now, without the market

In Cosmos: **ServApps → Import Compose File**, paste `cosmos-compose.json`, choose the service name and hostname, install. Cosmos renders the same template the market would.

## The servapp folder

[`upstream/servapps/OpenTodo/`](upstream/servapps/OpenTodo/) is the folder for the store, file for file:

| File | What it is |
| --- | --- |
| `description.json` | An identical copy of [`description.json`](description.json) (the market card) |
| `cosmos-compose.json` | An identical copy of [`cosmos-compose.json`](cosmos-compose.json) |
| `icon.png` | 256x256, from `web/public/pwa-512.png`; served at the `cosmos-icon` URL once merged |
| `screenshots/1.png`, `2.png` | 1280 wide, the Today and board screens (`docs/images/today-light.webp`, `board-light.webp`); the store's deploy crashes without this folder |

`node scripts/deploy-check.mjs` (`scripts/deploy/cosmos.mjs`) fails when a copy differs, a file is missing or extra, or a picture is not a PNG.

## Submitting (maintainer)

The store's validator checks that the image exists in its registry. It fails on `ghcr.io/pixari/opentodo:stable` until the release job has published the `stable` tag (the first release after the stable-image-tag change), so submit after that.

1. Test first in a Cosmos instance (0.22.23 or newer): **ServApps → Import Compose File** with `cosmos-compose.json`, pick a hostname, install, note the setup token from the post-install message, open the address, create the owner with it, add a task, restart the container and check the task is still there.
2. Fork [azukaar/cosmos-servapps-official](https://github.com/azukaar/cosmos-servapps-official) and clone the fork.
3. Copy the folder and run the store's validator (Node 18+; it fetches the image manifest and the GitHub repository):

   ```bash
   cp -R deploy/cosmos/upstream/servapps/OpenTodo /path/to/cosmos-servapps-official/servapps/
   cd /path/to/cosmos-servapps-official
   npm install
   node .github/scripts/validate-servapps.js OpenTodo
   ```

4. Commit on a branch (`git checkout -b add-opentodo && git add servapps/OpenTodo && git commit -m "Add OpenTodo"`), push to the fork and open a pull request against `master` with the title and body in [`upstream/PR.md`](upstream/PR.md). Their **validate** workflow checks it; once merged, the Pages workflow rebuilds the market.

## After a release

Nothing to do. The servapp names `ghcr.io/pixari/opentodo:stable`, which every release moves, and sets `cosmos-auto-update`, so Cosmos installs each release by itself. Send a pull request to the store only when the template itself changes.
