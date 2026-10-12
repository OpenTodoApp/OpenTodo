# Tasks

## 1. Template

- [x] 1.1 Rewrite `deploy/coolify/opentodo.yaml` to Coolify's conventions (design D1, D3): header fields in order, `SERVICE_URL_OPENTODO_8080`, `OPENTODO_BASE_URL=${OPENTODO_BASE_URL:-${SERVICE_URL_OPENTODO}}`, image `ghcr.io/pixari/opentodo:0.2`, optional variables with defaults, `/data` volume, health check; verify `node scripts/coolify-template-check.mjs`
- [x] 1.2 `deploy/coolify/upstream/templates/compose/opentodo.yaml` and `public/svgs/opentodo.svg` identical to the files in `deploy/coolify/` (square 64×64 viewBox logo from `website/assets/favicon.svg`, with a title and no external references); verify the check's identity and logo rules
- [x] 1.3 Draft docs page for `coollabsio/coolify-docs` (`content/docs/services/opentodo.mdx`, `public/images/services/opentodo-logo.svg`) in `deploy/coolify/upstream/coolify-docs/`; verify by reading it next to `content/docs/services/linkding.mdx`

## 2. Submission material

- [x] 2.1 `deploy/coolify/upstream/PR.md`: title `feat(service): add OpenTodo` and a body that follows `.github/pull_request_template.md`, under 2,500 characters with at most 5 code references; verify the length with `wc -c`
- [x] 2.2 `deploy/coolify/upstream/HOW-TO-SUBMIT.md`: test it in your own Coolify first (Docker Compose Empty, checklist), the eligibility rule, the discussion or issue to link, the target branch, the docs PR, the commit message and opening the PR; verify by following its paths against the Coolify clone

## 3. Automated check

- [x] 3.1 `scripts/coolify-template-check.mjs` (design D6) with `--smoke`; verify it passes, and that it fails on a copy with `:latest`, a missing health check or an unknown `OPENTODO_*` variable (`node --test scripts/coolify-template-check.test.mjs`)
- [x] 3.2 `make coolify-check` in `make check`, `make coolify-smoke`; CI job running the check and the smoke test; verify `make check` and a local `make coolify-smoke` against `ghcr.io/pixari/opentodo:0.2`

## 4. Dockerfile

- [x] 4.1 `ARG SOURCE_COMMIT` gives `dev+<7 chars>` when `VERSION` is `dev`; `HEALTHCHECK` gains `--start-interval=2s` after `--interval`; verify the version step in `sh` (dev + commit → `dev+0123456`, no commit → `dev`, `VERSION=v0.2.1` → `v0.2.1`), the `HEALTHCHECK` line on an image built `FROM ghcr.io/pixari/opentodo:0.2` (healthy after about 2 s, Coolify's flag patterns still read 30s/5s/5s/3), and the full multi-arch build in CI's Docker job

## 5. Docs

- [x] 5.1 `docs/self-hosting/coolify.md` (one-click template status and how to use it now; update behaviour per resource type; pulling images; Cloudflare; domains) and `deploy/coolify/README.md`; `make docs` twice with no diff; verify `make check`
- [x] 5.2 CHANGELOG Unreleased entry; verify `make check`
