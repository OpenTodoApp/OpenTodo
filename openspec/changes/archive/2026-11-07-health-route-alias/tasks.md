## 1. Server

- [x] 1.1 `GET /api/v1/health` on `handleHealth`, `public` with its reason (`internal/httpapi/router.go`); classed `pubStatic` in `route_matrix_public_test.go`, listed in `policy_test.go`, added to the v1 surface snapshot with `go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`; verified by `TestHealthRouteAlias` and `TestHealthRouteAliasUnhealthy` (`internal/httpapi/health_test.go`) and `go test ./internal/httpapi/...`
- [x] 1.2 No demo deny entry (a read with no outbound request); `TestDemoRobotsHeader` covers the route on a demo instance

## 2. Apps

- [x] 2.1 Android: `/api/v1/health` first, `/healthz` as the fallback (`HealthCheck.combine`, `HealthCheck.PATHS`); verified by `HealthCheckTest.routes` and `HealthCheckTest.combine` in `make android`; the instrumented test servers answer both routes
- [x] 2.2 iOS: the same order (`HealthCheck.paths`, `HealthCheck.combine`); verified by `HealthCheckTests.testRoutesInOrder` in CI's macOS job

## 3. Docs and checks

- [x] 3.1 `docs/api.md`, `docs/self-hosting/docker.md` (Pomerium, Cloud Run), `docs/self-hosting/README.md`, `docs/android-app.md`, `mobile/README.md`; `make docs-check`
- [x] 3.2 Changelog fragment `changelog.d/Added/health-route-alias.md`; `make repo-check`, `make openspec-validate`
