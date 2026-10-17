# Tasks

## 1. Publish stable

- [x] 1.1 `ci.yml`: the image job adds `type=raw,value=stable`, enabled for `v*` tags without `-`. Verify: the metadata step's expression; after the next release, `docker buildx imagetools inspect ghcr.io/pixari/opentodo:stable` shows the release digest.
- [x] 1.2 `promote-stable.yml`: manual workflow with a `version` input that retags an existing version as `stable` and refuses pre-releases. Verify: run it with `0.6.1`, then `imagetools inspect` shows the `0.6.1` digest.

## 2. Templates and checks

- [x] 2.1 `deploy/deploy.json` `"tag": "stable"`; `checkImage` in `scripts/deploy/common.mjs` requires `<image>:<tag>`; the deploy check fails when `ci.yml` no longer publishes `stable`. Verify: `node --test scripts/deploy/*.test.mjs` covers a `0.6` tag, a `latest` tag and a CI workflow without `stable`.
- [x] 2.2 `scripts/coolify-template-check.mjs` uses the shared rule. Verify: `node --test scripts/coolify-template-check.test.mjs`.
- [x] 2.3 Unraid and Coolify templates and their upstream copies, `docker-compose.yml` and the README examples use `:stable`. Verify: `node scripts/deploy-check.mjs` ok; `docker compose config` accepts `docker-compose.yml`.

## 3. Docs

- [x] 3.1 Unraid, Coolify and Docker guides, `deploy/README.md`, the Unraid and Coolify READMEs and the Coolify upstream notes explain `stable`, updates and pinning; `CHANGELOG.md` entry. Verify: `cd web && node scripts/docs/build.mjs && node scripts/docs/check.mjs`.
- [x] 3.2 `npx @fission-ai/openspec validate --all --strict`.
