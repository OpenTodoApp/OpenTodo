# Design: release hygiene

## Toolchain

`toolchain go1.26.9` is the latest 1.26 patch at least two weeks old (published 2026-10-02). `actions/setup-go` with `go-version-file: go.mod` installs the `toolchain` version when the line is present; a step after it compares `go version` with the line, so a runner that silently used another Go (for example `GOTOOLCHAIN=local` with an older install) fails instead of shipping it. The `go` line stays at `1.26.0`: it is the minimum language version for people building from source, and `GOTOOLCHAIN=auto` (the default) downloads 1.26.9 for them. The Dockerfile's `GO_VERSION` names the same patch instead of the floating `1.26` tag, and `scripts/repo-checks.test.mjs` keeps the two equal.

## Vulnerability gate

`go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...` in the server job, after `go vet`. Default (symbol) mode exits non-zero only for vulnerabilities reachable from our code; ones in imported packages that we do not call are reported but do not fail. v1.8.0 rather than v1.9.0, which is less than two weeks old. No new module dependency: `go run pkg@version` does not touch `go.mod`.

## Path filter test

A table in `scripts/repo-checks.test.mjs` (node:test, no dependency) pipes paths into `scripts/ci-changes.sh` and compares the outputs. The deploy scripts count as code like `deploy/` itself; the `coolify-template` job that checks them runs on every pull request already.

## Compose binding

`"${OPENTODO_BIND:-127.0.0.1}:${OPENTODO_PORT:-8080}:8080"` keeps the README's quick start (`docker compose up`, open `http://localhost:8080`) and the Coolify deploy unchanged, and closes the way around a reverse proxy. LAN access is one documented variable. Removing the Coolify instructions from the root file instead was rejected: the self-hosting spec promises the repository-URL deploy.
