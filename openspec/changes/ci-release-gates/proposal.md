# CI release gates: publish only what passed, pinned inputs, verifiable artefacts

## Why

An operations audit (OPS-3 to OPS-7, OPS-9, OPS-10, OPS-13 to OPS-15, OPS-17, OPS-23) found that the release chain can ship what was never checked:

- The image job needed only the server and OpenSpec jobs, so `stable`, `latest`, the version tags and the GitHub release moved even when the layout, UI, docs website or template checks failed.
- The Coolify smoke test started the already published `stable` image, not the image the run built; nothing ran the built image before pushing it.
- 48 action references used mutable tags (in jobs holding `packages: write` and `contents: write`), base images floated, and the OpenSpec CLI ran as `@latest --yes`. Nothing proposed updates.
- No signature, SBOM, provenance or vulnerability scan for the image; release binaries had only an unsigned `SHA256SUMS` from the same job.
- CI skipped parts of `make check` (design-system lint, translation catalogs, site bundle tests) although AGENTS.md says CI runs `make check`; there was no gofmt gate, no race detector, and the two-device/offline end-to-end scripts never ran (they had drifted from the UI).
- No job timeouts or concurrency groups, no CODEOWNERS, security reports only to a personal mailbox, and the 35 MB of UI baselines went into every Docker build context.

## What Changes

- **Gates before publishing.** The `docker` (publish) and `release` jobs need every other CI job. A new `image` job (pull requests too) builds the linux/amd64 image into the runner's Docker, scans it with Grype (fails on critical findings that have a fix) and runs the Coolify smoke test against it (`coolify-template-check.mjs --smoke --image opentodo:ci`); the separate `coolify-template` job is folded into it and `make deploy-check`.
- **Verifiable artefacts.** The published image has `provenance: mode=max` and an SBOM, and its digest is signed with cosign keyless (GitHub OIDC). The release job attests build provenance for every asset listed in `SHA256SUMS`. `id-token: write` and `attestations: write` are granted only to those two jobs. `docs/self-hosting/docker.md` explains `cosign verify`, `gh attestation verify` and reading the SBOM.
- **Pinned inputs.** Every action is pinned to a commit SHA with a `# vX.Y.Z` comment (current major, the newest patch at least two weeks old); Dockerfile base images and the Playwright job image are pinned by digest next to their tag; the OpenSpec CLI runs at an exact version from the `Makefile` (`make openspec-validate`). `.github/dependabot.yml` proposes weekly grouped updates for Go modules, `web/` npm, GitHub Actions and Docker base images.
- **CI runs `make check`.** A `checks` job runs `make ci-checks` (gofmt gate, OpenSpec, `ui-lint`, `i18n-check`, `deploy-check` with the site bundle tests, `repo-check`); it replaces the `openspec` job. `make check` gains `fmt-check`. The layout job runs `make e2e` (the repaired `e2e-smoke.mjs` and `e2e-views.mjs`). A nightly workflow runs `go test -race ./...`.
- **Operations.** A concurrency group per workflow and ref (pull requests cancel superseded runs, main and tags do not), `timeout-minutes` on every job, `.github/CODEOWNERS` for sensitive paths, `SECURITY.md` pointing to GitHub private vulnerability reporting, and a `.dockerignore` that leaves out baselines, scripts, deploy templates, the extension and the skill.
- `scripts/repo-checks.test.mjs` checks all of the above, so a regression fails `make check` and the `changes` job.

No change to the server, the web app, the op log or any environment variable. Operators gain signed images and attested downloads; nothing they run changes.

## Capabilities

### Modified Capabilities
- `self-hosting`: adds gated, verifiable releases; pinned and updated build inputs; CI parity with `make check`.

## Impact

- Workflows: `.github/workflows/ci.yml`, `helm.yml`, `promote-stable.yml`, `ui-baselines.yml`, new `nightly.yml`; `.github/dependabot.yml`, `.github/CODEOWNERS`.
- `Dockerfile` (digest-pinned bases; the golang tag replaces `ARG GO_VERSION`), `.dockerignore`, `Makefile` (`fmt-check`, `ci-checks`, `e2e`, `OPENSPEC_VERSION`, `PLAYWRIGHT_IMAGE`).
- Scripts: `coolify-template-check.mjs` (`--image`), `e2e-smoke.mjs` and `e2e-views.mjs` (selectors follow the current UI), `ci-changes.sh`, `repo-checks.test.mjs`.
- Docs: `docs/self-hosting/docker.md`, `SECURITY.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`.
- Job renames that branch protection may name: `OpenSpec (validate specs and changes)` is now `Checks (…)`; `Coolify template (check, smoke test)` is now `Docker image (build, scan, smoke test)`; the publishing job is `Docker image (publish, sign)` and does not run on pull requests.
- No new runtime dependency; no binary or bundle size change.
