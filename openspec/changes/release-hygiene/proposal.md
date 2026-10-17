# Release hygiene: patched toolchain, vulnerability gate, CI filter, loopback compose

## Why

An operations audit found that release binaries are built with Go 1.26.0 (`go 1.26.0` in `go.mod`, no `toolchain` line, and `setup-go` installs exactly that), which leaves 33 standard-library vulnerabilities reachable from our code (net/http, crypto/tls, crypto/x509 and others, all fixed by 1.26.9). Nothing in CI would notice. The same audit found smaller gaps around it:

- `scripts/ci-changes.sh` matches `skill/` instead of `skills/`, so a pull request that only touches the embedded agent skill skips the Go jobs; `scripts/deploy/` and the root `docker-compose.yml` are not classified at all, and the filter has no test.
- `SECURITY.md` says the audit log takes the **first** `X-Forwarded-For` entry; the code (and `docs/self-hosting/docker.md`) uses the last hop, the one the trusted proxy appended.
- The root `docker-compose.yml` publishes port 8080 on every interface although the same file is offered for Coolify, where the docs say not to publish the port (a client reaching the container around the proxy can choose its own `X-Forwarded-For`).
- The CI smoke test waits a fixed `sleep 1` before the health check.

## What Changes

- `go.mod` gains `toolchain go1.26.9`; every `setup-go` step reads `go.mod`, and the server and binaries jobs fail when the Go in use is not that toolchain. The Dockerfile's `GO_VERSION` is `1.26.9`.
- The server job runs `govulncheck` (pinned, `golang.org/x/vuln` v1.8.0), which fails on vulnerabilities the code can reach.
- `scripts/ci-changes.sh` classifies `skills/`, `scripts/deploy*`, the root `docker-compose.yml` and its own files as code. `scripts/repo-checks.test.mjs` holds a table of paths and expected outputs, plus checks for the toolchain, the compose binding and the `SECURITY.md` wording; it runs first in CI and in `make check` (`make repo-check`).
- The root `docker-compose.yml` publishes `${OPENTODO_BIND:-127.0.0.1}:${OPENTODO_PORT:-8080}:8080`. `docker compose up` then `http://localhost:8080` still works; NAS and home-server users set `OPENTODO_BIND=0.0.0.0` in `.env` to reach it from their network. Coolify is unaffected (it routes through its proxy).
- `SECURITY.md` describes the last `X-Forwarded-For` hop, `OPENTODO_TRUSTED_PROXIES` and not publishing the port directly.
- The CI smoke test polls `/healthz` instead of sleeping.

Behaviour change for operators: a plain-compose install that relied on reaching port 8080 from other machines must set `OPENTODO_BIND=0.0.0.0` after updating the compose file. No server, client, image, op log or environment variable of the server changes (`OPENTODO_BIND` is read by Compose only).
