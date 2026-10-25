## 1. Add-on repository

- [x] 1.1 `deploy/homeassistant/upstream/`: `repository.yaml`, the `opentodo` add-on (config, Dockerfile, start script, AppArmor profile, translations, docs, changelog, icon and logo), build, test and follow workflows, Dependabot, `scripts/bump.sh`; verified by the repository's Test workflow (add-on linter, ShellCheck, a start with `options.json`)
- [x] 1.2 Create `pixari/opentodo-homeassistant-addons`, publish `ghcr.io/pixari/opentodo-homeassistant:0.12.0` for amd64 and aarch64 and tag `v0.12.0`; verified by an anonymous pull of the manifest
- [x] 1.3 Test on Home Assistant OS 18.3 (Supervisor 2026.10.3, Home Assistant 2026.10.4) in a VM: add the repository, install, start, create the owner, add a task, change options and restart, back up and restore the add-on

## 2. Checks

- [x] 2.1 `scripts/deploy/homeassistant.mjs` and `homeassistant.test.mjs`; verified by `node --test scripts/deploy/*.test.mjs` and `node scripts/deploy-check.mjs`

## 3. Docs

- [x] 3.1 `deploy/homeassistant/README.md`, `docs/self-hosting/home-assistant-addon.md`, rows in `deploy/README.md`, `docs/README.md`, README and ROADMAP, CHANGELOG; verified by `make docs-check`
