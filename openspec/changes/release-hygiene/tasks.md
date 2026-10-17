# Tasks

## 1. Toolchain and vulnerability gate (OPS-1)
- [x] 1.1 `toolchain go1.26.9` in `go.mod`; Dockerfile `GO_VERSION=1.26.9`
- [x] 1.2 Toolchain check after `setup-go` in the server and binaries jobs
- [x] 1.3 Pinned `govulncheck` step in the server job; run it locally (1.26.0: 33 reachable, 1.26.9: none)

## 2. CI path filter (OPS-8)
- [x] 2.1 `skills/`, `scripts/deploy*`, `docker-compose.yml` and the filter's own files count as code
- [x] 2.2 `scripts/repo-checks.test.mjs` with a table of paths and outputs; run in the `changes` job and `make check`

## 3. Proxy address documentation (OPS-11)
- [x] 3.1 `SECURITY.md`: last `X-Forwarded-For` hop, `OPENTODO_TRUSTED_PROXIES`, do not publish the port

## 4. Compose binding (OPS-12)
- [x] 4.1 Root `docker-compose.yml` publishes on `${OPENTODO_BIND:-127.0.0.1}`; `.env.example`, README, docs/self-hosting/docker.md and coolify.md explain `OPENTODO_BIND`
- [x] 4.2 Deploy checks and `docker compose config` still pass

## 5. Smoke test (OPS-16)
- [x] 5.1 Poll `/healthz` instead of `sleep 1` in the server job

## 6. Wrap-up
- [x] 6.1 CHANGELOG entries; `openspec validate --all --strict`
