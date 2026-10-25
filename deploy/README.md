# Platform templates

One folder per platform, each with its template in that platform's own format. They all describe the same container, so the facts they must agree on live in one file, [`deploy.json`](deploy.json): the image, the port, the data directory, the health check, the name, links and icon, and the catalogue of optional `OPENTODO_*` variables a template may offer, with their defaults and descriptions.

| Platform | Folder | Image | Status |
| --- | --- | --- | --- |
| CapRover | [`caprover/`](caprover/) | `release` | Paste it as a one-click template; the official list wants 1k+ GitHub stars, so a third-party repository first |
| CasaOS / ZimaOS | [`casaos/`](casaos/) | `release` | Submitted: [IceWhaleTech/CasaOS-AppStore#1104](https://github.com/IceWhaleTech/CasaOS-AppStore/pull/1104); install as a custom app meanwhile |
| Coolify | [`coolify/`](coolify/) | `stable` | Not yet submitted: Coolify lists services from 1,000 GitHub stars; paste it as Docker Compose meanwhile |
| Cosmos Cloud | [`cosmos/`](cosmos/) | `stable` | Submitted: [azukaar/cosmos-servapps-official#329](https://github.com/azukaar/cosmos-servapps-official/pull/329); install as a custom compose meanwhile |
| Dokploy | [`dokploy/`](dokploy/) | `release` | Submitted: [Dokploy/templates#1265](https://github.com/Dokploy/templates/pull/1265); usable now as a templates base URL |
| Easypanel | [`easypanel/`](easypanel/) | `release` | Submitted: [easypanel-io/templates#1702](https://github.com/easypanel-io/templates/pull/1702); set up as an app service meanwhile |
| Fly.io | [`fly/`](fly/) | `stable` | No store: `fly launch --copy-config` with the file from this repository |
| Home Assistant add-on | [`homeassistant/`](homeassistant/) | `release` | Our own add-on repository, [`pixari/opentodo-homeassistant-addons`](https://github.com/pixari/opentodo-homeassistant-addons), published from `upstream/`; it builds its own image from the release |
| Kubernetes (Helm) | [`helm/`](helm/) | `release` | Published to `oci://ghcr.io/pixari/charts/opentodo` by `.github/workflows/helm.yml` from the next release; install from a clone meanwhile |
| Podman Quadlet | [`podman/`](podman/) | `stable` | No store: copy the two unit files; `podman auto-update` follows `stable` |
| Portainer | [`portainer/`](portainer/) | `stable` | Submitted: [Lissy93/portainer-templates#160](https://github.com/lissy93/portainer-templates/pull/160); usable now as an App Templates URL |
| Render | [`render/`](render/) | `stable` | Usable now with the Deploy to Render button (Blueprint path `deploy/render/render.yaml`) |
| Runtipi | [`runtipi/`](runtipi/) | `release` | Our own app store, [`pixari/opentodo-runtipi`](https://github.com/pixari/opentodo-runtipi), published from `upstream/` |
| Synology (Container Manager) | [`synology/`](synology/) | `stable` | Usable now as a Container Manager project; Synology has no container store |
| TrueNAS Community Edition | [`truenas/`](truenas/) | `release` | Submitted: [truenas/apps#6240](https://github.com/truenas/apps/pull/6240); install via YAML meanwhile |
| Umbrel | [`umbrel/`](umbrel/) | `release-digest` | Submitted: [getumbrel/umbrel-apps#6251](https://github.com/getumbrel/umbrel-apps/pull/6251) |
| Unraid | [`unraid/`](unraid/) | `stable` | Listed in Community Applications (**Apps**), from [`pixari/opentodo-unraid`](https://github.com/pixari/opentodo-unraid) |

## Checks

`make check` (and CI) runs `node scripts/deploy-check.mjs`. For every folder here it loads `scripts/deploy/<folder>.mjs`, which parses that platform's format and applies the shared rules in `scripts/deploy/common.mjs`:

- the image follows the platform's policy (the **Image** column): `stable` is `ghcr.io/pixari/opentodo:stable` (`tag` in `deploy.json`), `release` is the latest release in `CHANGELOG.md`, `release-digest` is that release plus its multi-arch index digest; and the release job in `.github/workflows/ci.yml` still publishes `stable`;
- the container port is 8080 and the data is mounted on `/data`;
- every `OPENTODO_*` variable is in the catalogue and read by `internal/config`, with the catalogue's default, and none is required;
- the essential variables (base URL, setup token, sign-up, trusted proxies) are offered.

A folder without a checker fails the run. Tests: `node --test scripts/deploy/*.test.mjs`.

## Adding a platform

1. Add the variable to `deploy.json` first if the platform should offer one that is not catalogued yet (the check refuses it otherwise).
2. Create `deploy/<platform>/` with the template and a `README.md` (how to install before it is listed, how to submit it).
3. Add `scripts/deploy/<platform>.mjs` exporting `check(ctx)` and `summary`. Parse the format strictly (YAML files go through the one shared parser, `scripts/deploy/yaml.mjs`: pick the profile that matches what the platform's file may use, or add one there with tests in `yaml.test.mjs`; never write another YAML parser), check what is specific to the platform, and pass `{ image, port, dataTarget, variables, policy }` to `checkShared()`. `unraid.mjs` is a short example. Add tests in `scripts/deploy/<platform>.test.mjs`.
4. Add `docs/self-hosting/<platform>.md` and list it in `docs/README.md`, and add a row to the table above.

## On a release

Templates on `stable` need no change: the release job moves the tag to the new version (release candidates leave it alone), so those installs get the release through their platform's update button.

Templates on `release` or `release-digest` are for stores that refuse moving tags or offer updates only when a version changes. Preparing a release fails `make check` until they name the new version; after the release job has published the image, `node scripts/deploy/pin.mjs` writes the new digests (`--check` lists stale ones).

Then, once the release is published, open an update pull request in each store that pins the version (release candidates are never submitted). Each folder's README has the exact steps:

| Store | After a release |
| --- | --- |
| Umbrel ([`umbrel/`](umbrel/README.md#on-every-release)) | Pull request to `getumbrel/umbrel-apps` titled `Update OpenTodo to <version>`: `version`, `releaseNotes`, the tag and the digest (after `pin.mjs`). Umbrel offers the update only when `version` changes. |
| Dokploy ([`dokploy/`](dokploy/README.md#on-a-release)) | Pull request to `Dokploy/templates` (against `canary`): the image tag in `docker-compose.yml` and `"version"` in `meta.json`. |
| TrueNAS ([`truenas/`](truenas/README.md#after-a-release)) | Once the app is accepted, their Renovate bumps the tag, `app_version` and `version`; check it did, and open the pull request yourself if it missed the release. While truenas/apps#6240 is open, push the bump to its branch. |
| CasaOS ([`casaos/`](casaos/README.md#after-a-release)) | Pull request to `IceWhaleTech/CasaOS-AppStore`: the tag, `x-casaos.version`, `update_at` and `release_notes`. The store offers the update only when `version` changes. |
| Easypanel ([`easypanel/`](easypanel/README.md#after-a-release)) | Pull request to `easypanel-io/templates`: the default image in `meta.yaml` and a `changeLog` entry. |
| Runtipi ([`runtipi/`](runtipi/README.md#on-a-release)) | Our own store: review and merge the Renovate pull request in `pixari/opentodo-runtipi`, then bring the change back here. |
| Home Assistant ([`homeassistant/`](homeassistant/README.md#on-a-release)) | Our own repository: its **Follow OpenTodo** workflow publishes the add-on for the release within a day; check it ran, then run `deploy/homeassistant/upstream/scripts/bump.sh <version>` here if release preparation did not already. |
| CapRover ([`caprover/`](caprover/README.md#on-a-release)) | Once submitted: the version field, as a pull request to `caprover/one-click-apps` or a push to `pixari/opentodo-caprover`. |

No pull request after a release for Unraid, Cosmos and Portainer: they name `stable` (a store pull request only when the template itself changes). The Claude plugin is published by the CI job `claude-plugin`. The Helm chart (`helm/opentodo/Chart.yaml`) also names the release: bump `version`, `appVersion` and the `artifacthub.io/images` tag; the release tag publishes it. The **Promote stable** workflow (Actions → Promote stable → Run workflow, with a version such as `0.6.1`) points `stable` at an older release to roll back, without rebuilding.
