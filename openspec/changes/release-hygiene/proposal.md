# Release hygiene: patched toolchain, vulnerability gate, CI filter, loopback compose

## Why

An operations audit found that release binaries are built with Go 1.26.0 (`go 1.26.0` in `go.mod`, no `toolchain` line, and `setup-go` installs exactly that), which leaves 33 standard-library vulnerabilities reachable from our code (net/http, crypto/tls, crypto/x509 and others, all fixed by 1.26.9). Nothing in CI would notice. The same audit found smaller gaps around it:

- `scripts/ci-changes.sh` matches `skill/` instead of `skills/`, so a pull request that only touches the embedded agent skill skips the Go jobs; `scripts/deploy/` and the root `docker-compose.yml` are not classified at all, and the filter has no test.
- `SECURITY.md` says the audit log takes the **first** `X-Forwarded-For` entry; the code (and `docs/self-hosting/docker.md`) uses the last hop, the one the trusted proxy appended.
- The root `docker-compose.yml` publishes port 8080 on every interface with no way to restrict it, although the docs say not to publish the port behind a reverse proxy (a client reaching the container around the proxy can choose its own `X-Forwarded-For`).
- The CI smoke test waits a fixed `sleep 1` before the health check.

## What Changes

- `go.mod` gains `toolchain go1.26.9`; every `setup-go` step reads `go.mod`, and the server and binaries jobs fail when the Go in use is not that toolchain. The Dockerfile's `GO_VERSION` is `1.26.9`.
- The server job runs `govulncheck` (pinned, `golang.org/x/vuln` v1.8.0), which fails on vulnerabilities the code can reach.
- `scripts/ci-changes.sh` classifies `skills/`, `scripts/deploy*`, the root `docker-compose.yml` and its own files as code. `scripts/repo-checks.test.mjs` holds a table of paths and expected outputs, plus checks for the toolchain, the compose binding and the `SECURITY.md` wording; it runs first in CI and in `make check` (`make repo-check`).
- The root `docker-compose.yml` publishes `${OPENTODO_BIND:-0.0.0.0}:${OPENTODO_PORT:-8080}:8080`: unchanged by default (LAN installs keep working), and operators with a reverse proxy on the same machine can set `OPENTODO_BIND=127.0.0.1`, documented as the safer choice. Trusting `X-Forwarded-For` only from trusted proxies is fixed separately in the server.
- `SECURITY.md` describes the last `X-Forwarded-For` hop, `OPENTODO_TRUSTED_PROXIES` and not publishing the port directly.
- The CI smoke test polls `/healthz` instead of sleeping.

No behaviour change for existing installs. No server, client, image, op log or environment variable of the server changes (`OPENTODO_BIND` is read by Compose only).
