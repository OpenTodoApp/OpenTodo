# Tasks

## 1. Gates before publishing (OPS-4, OPS-9)
- [x] 1.1 `docker` and `release` need every other job; publishing never runs on pull requests
- [x] 1.2 `image` job: build linux/amd64 into Docker, Grype scan (critical with a fix fails), Coolify smoke test against the built image
- [x] 1.3 `coolify-template-check.mjs --image <ref>` (compose override with `pull_policy: never`); test for the override; verified locally against a locally built image

## 2. Verifiable artefacts (OPS-6)
- [x] 2.1 Image with `provenance: mode=max` and `sbom: true`; cosign keyless signature of the pushed digest
- [x] 2.2 Build provenance attestation for every release asset; OIDC and attestation permissions on those jobs only
- [x] 2.3 `docs/self-hosting/docker.md`: verifying with `cosign verify`, `gh attestation verify`, SBOM and provenance

## 3. Pinned inputs and updates (OPS-3, OPS-5, OPS-13, OPS-14)
- [x] 3.1 Every action pinned to a commit SHA with `# vX.Y.Z` (all workflows)
- [x] 3.2 Dockerfile bases and the Playwright job image pinned by digest (`PLAYWRIGHT_IMAGE` in the Makefile)
- [x] 3.3 OpenSpec CLI at an exact version (`OPENSPEC_VERSION`); AGENTS.md and README use `make openspec-validate`
- [x] 3.4 `.github/dependabot.yml`: gomod, npm `/web`, github-actions, docker; weekly, grouped

## 4. CI runs make check (OPS-7, OPS-10, OPS-17)
- [x] 4.1 `make ci-checks` (fmt-check, openspec-validate, ui-lint, i18n-check, deploy-check, repo-check) in a `checks` job; `fmt-check` in `make check`
- [x] 4.2 Repair `e2e-smoke.mjs` and `e2e-views.mjs`; `make e2e`; run in the layout job; path filter counts them as code
- [x] 4.3 Nightly `go test -race ./...`; relax timing assertions under the race detector

## 5. Operations (OPS-15, OPS-23)
- [x] 5.1 Concurrency group per workflow and ref; `timeout-minutes` on every job
- [x] 5.2 `.github/CODEOWNERS`; `SECURITY.md` points to private vulnerability reporting
- [x] 5.3 `.dockerignore` leaves out baselines, scripts, deploy, extension and skill; Docker build verified locally

## 6. Regression checks
- [x] 6.1 `scripts/repo-checks.test.mjs`: pins, timeouts, concurrency, digests, publish needs, image under test, signing, CI parity, OpenSpec pin, e2e and race, Dependabot, CODEOWNERS, `.dockerignore`
- [x] 6.2 CHANGELOG (Security)
