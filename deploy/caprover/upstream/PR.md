# Pull request to caprover/one-click-apps

Base branch: `master`. Branch in the fork: `add-opentodo`. Files: `public/v4/apps/opentodo.yml`, `public/v4/logos/opentodo.png` (from `deploy/caprover/upstream/public/`).

Open it only once OpenTodo meets their bar for the official list (1k+ stars or 10k+ downloads): their checklist workflow fails the pull request while any box is unticked, and the first box states it. Until then, publish the same files in a third-party repository (see `deploy/caprover/README.md`, option B).

## Title

Add OpenTodo

## Body

[OpenTodo](https://github.com/pixari/opentodo) is an open-source (AGPL-3.0), self-hosted, local-first task manager: one Go binary with SQLite and an embedded web app that works offline and syncs every device. This adds `public/v4/apps/opentodo.yml` and its logo.

- One service from `ghcr.io/pixari/opentodo:$$cap_opentodo_version` (multi-arch amd64 and arm64), defaulting to the latest release. `containerHttpPort: '8080'`, one named volume on `/data`. The image runs as a non-root user (65532) and Docker copies its `/data` ownership into the new named volume, so no extra step is needed.
- No database or other service. No field is required.
- Form fields: version, base URL (empty, because a new app is served over plain http and an https base URL there breaks sign-in), a setup token generated with `$$cap_gen_random_hex(32)` (asked when the first account, the owner, is created, so a fresh instance cannot be claimed by a stranger), open sign-up (`false`), trusted proxies.
- `instructions.end` shows the setup token and says to enable HTTPS and then set `OPENTODO_BASE_URL` to `https://$$cap_appname.$$cap_root_domain`.

Tested with **>> TEMPLATE <<** on CapRover <version>: installed, created the owner with the token from the end message, added a task, enabled HTTPS, set the base URL, Save & Update, signed in again; the data survived the update.

<!-- caprover-pr-checklist -->
### Self Check before Merge

- [ ] Please note that the official repository is for popular apps with 1k+ of stars or 10k+ downloads. If you'd like to add a less popular app, you can always [create your own 3rd party repo](https://github.com/caprover/one-click-apps#build-your-own-one-click-app-repository) and add your app there.
- [ ] I have tested the template using the method described in README.md thoroughly
- [x] I have ensured that I put as much default values as possible (except passwords) to ensure minimum effort required for end users to get started.
- [x] I have ensured that I am not using the "latest" tag as this tag is dynamically changing and might break the one-click app. Use a fixed version.
- [x] I have made sure that instructions.start and instructions.end are clear and self-explanatory.
- [x] Icon is added as a png file to the logos directory.
- [x] I've executed the checks if necessary by running `npm ci && npm run validate_apps && npm run formatter` (If failling run the prettier: `npm run formatter-write`)
- [x] I will take responsibility addressing any issues that arises as a result of this PR (maintaining this app).

<!-- Tick the first box only when it is true, and the second after testing on a CapRover instance; fill in the CapRover version above. -->
