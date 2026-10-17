# Design: CI release gates

## Publishing after every gate

`docker` and `release` list every other job of `ci.yml` in `needs` (a repo check computes the list, so a new gate job cannot be forgotten). On pushes and tags the path filter reports `code=true`, so every gate runs; a skipped or failed gate skips publishing. `helm.yml` already waits for the release image, so the chart follows the same gate.

## Testing the image that ships

The `image` job builds linux/amd64 with `load: true` into the runner's Docker, scans it and smoke-tests it with the Coolify template, replacing the template's image through the compose override (`image:` plus `pull_policy: never`). The `docker` job then builds the multi-arch image from the same commit and the same pinned bases, reusing the amd64 layers from the build cache. The two builds are not bit-for-bit guaranteed to share a digest (BuildKit metadata), but the binary is built with `-trimpath` from the same inputs; pushing the tested amd64 image and adding arm64 to it was rejected as more moving parts than it is worth. The arm64 server binary is cross-compiled in the `cli` job on every run.

Scanner: Grype (`anchore/scan-action`) with `severity-cutoff: critical` and `only-fixed: true`, so an unfixable finding in the distroless base does not block a release while a fixable one does. Trivy would do as well; one scanner is enough.

## Signatures and provenance

BuildKit attaches the SBOM and `mode=max` provenance to the pushed index. cosign (keyless, Fulcio certificate from the job's OIDC token, Rekor entry) signs the digest returned by the build, never a tag. The release job attests build provenance for every asset listed in `SHA256SUMS` (`subject-checksums`), so `gh attestation verify <file> --repo pixari/opentodo` works per download. OIDC and attestation permissions are on those two jobs only.

## Pinned inputs

Actions: the newest patch of the major already in use that is at least two weeks old, SHAs from `git ls-remote` (peeled for annotated tags). Base images: index digests from the registries, written as `tag@sha256:…`. The Dockerfile names `golang:1.26.9-alpine@sha256:…` literally instead of `ARG GO_VERSION`, because Dependabot cannot update a tag built from a variable; the repository check now reads the Go version from that line (the release-hygiene requirement that it equals the `go.mod` toolchain still holds). OpenSpec CLI: 1.13.2, the newest release at least two weeks old, in `OPENSPEC_VERSION`; AGENTS.md and README point to `make openspec-validate`.

## CI parity

`make ci-checks` holds the parts of `make check` that the web, server and extension jobs do not run; a repo check fails when `make check` gains a prerequisite that neither `ci-checks` nor a listed CI step covers. Static analysis and web lint, added separately, join `ci-checks`.

The end-to-end scripts had drifted from the UI (sidebar menus, Settings landing on Account, Filters instead of Views, Boards instead of Dashboards, quick add focused on load); they were repaired and pass locally against a fresh server in about 10 s and 15 s, so they run on every pull request in the layout job instead of nightly. `e2e-smoke.mjs` now reports failed requests with their URL and ignores only the expected 404 for a just-created project's public links.

`go test -race ./...` takes too long for every pull request, so it runs nightly (and on demand). Tests do not assert wall-clock durations (the calendar expansion test counts work units, test-integrity), so the race detector needs no allowance.

## Concurrency

`group: <workflow>-<ref>`, `cancel-in-progress` only for pull requests. On main a newer push can still replace a *pending* run (GitHub keeps one pending run per group); the newer run publishes the newer commit, which is what `latest` should show. Tags have their own ref, so releases never cancel each other.
