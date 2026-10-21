# CapRover one-click app

A [CapRover](https://caprover.com) one-click app in the v4 format of [`caprover/one-click-apps`](https://github.com/caprover/one-click-apps) (`public/v4/apps/<name>.yml`, a Docker Compose subset with `captainVersion: 4` and a `caproverOneClickApp` section).

| Path | What |
| --- | --- |
| [`opentodo.yml`](opentodo.yml) | The app. One service, `$$cap_appname`, from `ghcr.io/pixari/opentodo:$$cap_opentodo_version` (the version field defaults to the latest release, `0.9.0`). `containerHttpPort: '8080'` (CapRover's nginx proxies to it; no published port). The named volume `$$cap_appname-data` on `/data`. Four form fields passed as `OPENTODO_*`: base URL (empty), setup token (generated, `$$cap_gen_random_hex(32)`), open sign-up (`false`), trusted proxies (empty). The message after the install shows the setup token and says how to turn on https and then set the base URL. |
| `upstream/public/v4/apps/opentodo.yml`, `upstream/public/v4/logos/opentodo.png` | Byte-identical copies at the paths they take in `caprover/one-click-apps`. The logo is `web/public/pwa-512.png` (their validator wants a png named like the app). |
| [`upstream/PR.md`](upstream/PR.md) | Pull request title and body, with their checklist. |

`node scripts/deploy-check.mjs` (part of `make check`) parses the file strictly and checks the format, the release in the version field (and that its regex refuses `latest` and `stable`), the port, the named volume, the form fields (catalogue descriptions, defaults that pass their own regexes the way CapRover's form tests them, ids that are not prefixes of one another, since CapRover replaces them one after another), the generated token, the empty base URL, the logo and the copies (`scripts/deploy/caprover.mjs`; tests in `scripts/deploy/caprover.test.mjs`). Edit `opentodo.yml`, then copy it to `upstream/public/v4/apps/opentodo.yml`.

**Status: not yet submitted.**

## Choices, and the evidence

- **Release tag, not `stable`.** The pull request checklist of `caprover/one-click-apps` (`.github/PULL_REQUEST_TEMPLATE.md`, enforced by `validate-pr-checklist.yml`) asks: "I have ensured that I am not using the "latest" tag as this tag is dynamically changing and might break the one-click app. Use a fixed version." Their README shows the pattern: a `$$cap_<app>_version` variable with a pinned `defaultValue`. A one-click app is a template: CapRover deploys it once and never looks at it again. A new version in the list reaches only new installs; existing apps get updates when their owner deploys a new image (see "On a release").
- **Base URL starts empty.** CapRover serves a new app at `http://<app>.<root domain>`. HTTPS is a button in the app's **HTTP Settings** (Let's Encrypt), and it is off until someone clicks it. With an `https://` base URL over plain http the session cookie is `Secure`, the browser drops it and sign-in fails. So the field starts empty, and the message after the install says to set `OPENTODO_BASE_URL=https://$$cap_appname.$$cap_root_domain` under **App Configs** once HTTPS and **Force HTTPS** are on. CapRover's nginx sends `X-Forwarded-For` and `X-Forwarded-Proto` (`template/server-block-conf.ejs` in `caprover/caprover`), and it is the only proxy, so trusted proxies stay empty unless Cloudflare's proxy is in front.
- **Generated setup token.** `$$cap_gen_random_hex(32)` as the default is replaced in the browser before the form is shown (caprover-frontend `Utils.replaceAllGenRandomForOneClickApp`), and the backend substitutes the field value everywhere in the template (`OneClickAppDeployManager.ts`), so the same token is in the environment and in the message after the install.
- **Volume ownership (uid 65532).** CapRover turns a volume whose source does not start with `/` into a Docker named volume (`OneClickAppDeploymentHelper.ts`, `DockerApi.ts`: `Type: volume`, no `NoCopy`). It first runs its placeholder image (`caprover/caprover-placeholder-app`, which has no `/data`) with the volume mounted, which leaves the volume empty and owned by root; when OpenTodo's container starts on that empty volume, Docker copies the image's `/data`, ownership included (65532:65532). Checked with Docker in exactly that order (see "Tested"). No fix is needed for the named volume. A **host path** (what CapRover offers as the alternative under **App Configs → Persistent Directories**) is created by the admin and owned by root, so the guide says to `chown -R 65532:65532` it.
- **Health check.** CapRover ignores `healthcheck` in a one-click app; Docker Swarm uses the image's own `HEALTHCHECK` (`/opentodo healthcheck`).

## Install it now, before it is listed

In the CapRover dashboard: **Apps → One-Click Apps/Databases**, choose **>> TEMPLATE <<** at the end of the list, paste the content of [`opentodo.yml`](opentodo.yml) (raw: `https://raw.githubusercontent.com/pixari/opentodo/main/deploy/caprover/opentodo.yml`) and click **Next**. The rest is as for a listed app (`docs/self-hosting/caprover.md`).

## Submit

Read this first: the checklist of `caprover/one-click-apps` starts with "the official repository is for popular apps with 1k+ of stars or 10k+ downloads. If you'd like to add a less popular app, you can always create your own 3rd party repo". OpenTodo had 31 stars when this was written. Until it passes that bar, a pull request would have to leave the first box unticked, and their checklist workflow fails the pull request until every box is ticked. So there are two ways; the second works today.

### A. Pull request to caprover/one-click-apps (once the bar is met)

1. Fork [`caprover/one-click-apps`](https://github.com/caprover/one-click-apps) and create a branch from `master`, for example `add-opentodo`.
2. Copy `deploy/caprover/upstream/public/` over `public/` in the fork (it adds `public/v4/apps/opentodo.yml` and `public/v4/logos/opentodo.png`).
3. Run their checks: `npm ci && npm run validate_apps && npm run formatter && npm run build`.
4. Test it on a CapRover instance with **>> TEMPLATE <<** (their README asks for it): install, create the owner with the token from the message, add a task, enable HTTPS, set the base URL, **Save & Update**, sign in again.
5. Push and open the pull request against `master` with the title and body in `upstream/PR.md`, all checklist boxes ticked.

### B. Our own third-party repository (works now)

CapRover can add other one-click repositories (**One-Click Apps/Databases → 3rd party repositories → Connect New Repository**). Their README describes how to make one from a fork, published with their GitHub Pages workflow:

1. Fork `caprover/one-click-apps` as **`pixari/opentodo-caprover`** (rename the fork in its settings).
2. Delete every app and logo in `public/v4/apps/` and `public/v4/logos/` (their README: "Delete all existing apps (to avoid duplicate apps)"), then copy `deploy/caprover/upstream/public/` over `public/`.
3. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. Push to `master`: their `deploy.yml` validates, builds and publishes to `https://pixari.github.io/opentodo-caprover`.
4. Check `https://pixari.github.io/opentodo-caprover/v4/list` lists OpenTodo, then connect that URL in a CapRover instance and install from it.
5. Add the repository URL to `docs/self-hosting/caprover.md` (Install) and to the platform table in `deploy/README.md`.

## On a release

`make check` fails until the version field names the new release. Change `defaultValue` of `$$cap_opentodo_version` in `opentodo.yml`, copy it to `upstream/public/v4/apps/opentodo.yml`, and then bring it to the store: a pull request to `caprover/one-click-apps` (A) or a push to `pixari/opentodo-caprover` (B). That changes only new installs. Existing installs update themselves: the guide tells owners to deploy the new image (**Deployment → Deploy via ImageName**, `ghcr.io/pixari/opentodo:<version>`); CapRover pulls an explicitly named image on every deploy (`ImageMaker.ts`), so `ghcr.io/pixari/opentodo:stable` there also works and fetches the current release each time.

## Tested

- Their validator, formatter and build on a copy of `caprover/one-click-apps` with this app added: `npm run validate_apps` (prints "Validated opentodo"), `npm run formatter` ("All matched files use Prettier code style!"), `npm run build` (writes `dist/v4/apps/opentodo` and the list entry).
- The built JSON rendered the way CapRover does (random hex, form defaults, split/join of every id after `$$cap_appname`), then run with Docker in CapRover's order: the placeholder image with the named volume first, then `ghcr.io/pixari/opentodo:0.9.0` with the rendered environment on the same volume. `/data` became 65532-owned, `/healthz` answered ok, the container turned healthy, creating the owner failed without the token and worked with the one from the end message, and the owner survived a restart and a replaced container.
- Not tested: a real CapRover instance (Swarm, its nginx, Let's Encrypt). Before submitting, run step A.4.
