## Why

The mobile apps check a server by asking `GET /healthz` for `{"status":"ok","version":"…"}` (#1000). Some reverse proxies and platforms answer that path themselves before the request reaches OpenTodo: Pomerium reserves `/healthz` on its proxy listeners and answers a plain `OK`, and Google Cloud Run's front end reserves root paths ending in `z` and answers its own 404. Behind them the first-run screen says the address is not an OpenTodo server, and nothing in the proxy can change that.

## What Changes

- The server answers the same health check at `GET /api/v1/health`: no authentication, the same payload and statuses as `/healthz` (200 with the version, 503 `unhealthy` when the database is unreachable). `/healthz` is unchanged; container health checks, deployment templates and monitors keep using it.
- The Android and iOS apps ask `/api/v1/health` first and fall back to `/healthz` when that does not settle the check, so servers before 1.0.1 keep working.
- `docs/api.md`, the reverse-proxy part of the self-hosting docs (Pomerium, Cloud Run), the Android guide's bypass list and `mobile/README.md` name the new route.

Out of scope: moving or removing `/healthz`, a `HEAD` route, the host mode's own address-level health answer (a tenant's address serves the new route like any other), the `ot` CLI and the browser extension (neither calls `/healthz`). Advances no ROADMAP.md item; a fix for #1000.

## Capabilities

### New Capabilities

### Modified Capabilities
- `http-api`: the health endpoint is also served at `/api/v1/health`.
- `native-shells`: the first-run check asks `/api/v1/health`, then `/healthz`.

## Impact

`internal/httpapi/router.go` (one route on the existing handler, `public` with its reason), `internal/httpapi/route_matrix_public_test.go` (promise class: no account data), `policy_test.go`, the v1 surface snapshot (one additive entry), `internal/httpapi/health_test.go`; `mobile/android/.../HealthCheck.kt` and `mobile/ios/OpenTodo/HealthCheck.swift` with their tests. No data, op schema, setting, dependency or environment variable changes; works offline as before (the check needs the network either way).
