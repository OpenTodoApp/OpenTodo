## 1. Host request limit

- [x] 1.1 `httpapi.ClientKey`, `httpapi.ConfigureClientIdentity`; `Host.ServeHTTP` keys the request window by tenant and client; `TestRequestLimitPerClient` fails before, `TestRequestLimit` still passes; `go test ./internal/host/`

## 2. Demo sandboxes

- [x] 2.1 `demoAddrKey` (IPv6 `/48`) for sandbox creation; `TestSandboxLimitGroupsIPv6Sites`
- [x] 2.2 `makeRoom` evicts the oldest sandbox older than 15 minutes; in-memory global creation rate; `TestSandboxCapEvictsOldestAndLimitsTurnover`, `TestSandboxCapEvictsIdle` still passes

## 3. Docs and checks

- [x] 3.1 `docs/self-hosting/host-mode.md`, `docs/self-hosting/demo.md`; CHANGELOG `### Security`
- [x] 3.2 `go test ./...`, `make openspec-validate`
