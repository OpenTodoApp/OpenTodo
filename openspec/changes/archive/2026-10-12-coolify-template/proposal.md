# Coolify one-click service template

## Why

OpenTodo already ships `deploy/coolify/opentodo.yaml`, a draft of a Coolify one-click service template, but it was written before checking Coolify's current template conventions and it is not ready to submit upstream:

- It declares the domain with `SERVICE_FQDN_OPENTODO_8080`. Coolify's templates now use `SERVICE_URL_<NAME>_<PORT>` (318 of 386 templates in `templates/compose/`; 11 still use the older `SERVICE_FQDN_*_PORT`).
- It exposes only `OPENTODO_ALLOW_SIGNUP`. In Coolify, a variable set in the UI reaches a Compose service only when the compose file references it. We hit this in production: `OPENTODO_TRUSTED_PROXIES` set in the UI was silently dropped until the compose file referenced it.
- Nothing checks it. The image tag, the health check and the variable names can drift from the release and from `internal/config` without anyone noticing.
- There is nothing ready to submit: no folder that mirrors Coolify's repository paths, no pull request text that follows their template, and no submission steps. Coolify's own rules (eligibility, target branch, required docs PR, generated files that contributors must not touch) are not written down anywhere in this repository.

Separately, an image built from source by Coolify (Dockerfile or Compose build pack) reports version `dev`, and with the image's `HEALTHCHECK` (30 s interval, Docker's default 5 s probing while starting), a rolling update of Coolify's Dockerfile and Docker Image build packs races Coolify's first health poll at 5 s. When the probe loses the race, the update waits another 30 s.

## What Changes

- Rewrite `deploy/coolify/opentodo.yaml` to follow Coolify's current template conventions: header fields in their usual order (`documentation`, `slogan`, `category`, `tags`, `logo`, `port`), `SERVICE_URL_OPENTODO_8080`, `OPENTODO_BASE_URL` from `SERVICE_URL_OPENTODO` (an operator value set in the UI takes precedence), the pinned release image line `ghcr.io/pixari/opentodo:0.2`, a named volume on `/data`, a health check with `/opentodo healthcheck`, and the useful optional variables written as `${VAR:-default}` so they appear in Coolify's Environment Variables tab. No variable is required.
- Add `deploy/coolify/upstream/`, ready to submit. It mirrors Coolify's repository paths (`templates/compose/opentodo.yaml`, `public/svgs/opentodo.svg`) and contains a draft docs page for `coollabsio/coolify-docs`, `PR.md` (title and body following Coolify's pull request template) and `HOW-TO-SUBMIT.md` (test in your own Coolify first, then fork, branch, commit and open the PR).
- Add `scripts/coolify-template-check.mjs`, run by `make check` and CI. It checks the template's conventions, that the tag matches the latest release in `CHANGELOG.md`, that every `OPENTODO_*` name exists in `internal/config`, and that the upstream copies are identical. When Docker is available it also runs `docker compose config`. With `--smoke` it starts the image the way the template does and probes `/healthz` and the health check.
- Dockerfile: accept Coolify's `SOURCE_COMMIT` build argument, so an image built from source reports `dev+<short commit>` instead of `dev`. Add `--start-interval=2s` to the `HEALTHCHECK`, so a new container counts as healthy within seconds during rolling updates. Steady-state probing stays at 30 s.
- Docs: `docs/self-hosting/coolify.md` and `deploy/coolify/README.md` say the template has been submitted upstream and is pending, and explain how to use it before Coolify accepts it (Docker Compose Empty). The docs also correct how updates behave in each Coolify resource type: one-click and Compose resources recreate the container, and only the Dockerfile and Docker Image build packs roll.

## Out of scope

- Opening the upstream pull request (the maintainer submits it from their own GitHub account) and the 1,000-star eligibility rule Coolify applies.
- Owner pre-creation and other changes to application behaviour that came out of the analysis. They are separate proposals; `owner-bootstrap` is drafted alongside this change.
- Changing `docker-compose.yml` (the repository-based Compose deployment). It keeps the older but supported `SERVICE_FQDN_OPENTODO_8080`.

ROADMAP: advances self-hosting / easy deployment (one-click install on Coolify). No ROADMAP item names this change.

## Impact

- Files: `deploy/coolify/**`, `scripts/coolify-template-check.mjs`, `Makefile`, `.github/workflows/ci.yml`, `Dockerfile`, `docs/self-hosting/coolify.md`, `CHANGELOG.md`.
- No new dependency (the check uses Node's standard library), no new mandatory environment variable, no op-log or schema change. Image size: unchanged.
- Spec: `self-hosting` gains "Coolify one-click service template" and "Build version from source".
