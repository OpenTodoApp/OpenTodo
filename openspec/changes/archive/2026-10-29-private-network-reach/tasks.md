## 1. Outbound policy

- [x] 1.1 `internal/outbound`: `IsAlwaysDenied` and `Dialer.AllowPrivateHost`; `TestAllowPrivateKeepsMetadataDenied`, `TestAllowPrivateHost`; `go test ./internal/outbound/`

## 2. Map proxy

- [x] 2.1 `internal/httpapi/maps.go`: the real client uses `mapsPrivateHost` (owner hosts only, none when hosted); `TestMapProxyPrivateTargets` fails before and passes after

## 3. Webhooks

- [x] 3.1 Per-user limit for test sends and redeliveries; `TestWebhookHandSendsAreLimited`

## 4. Docs and checks

- [x] 4.1 `docs/webhooks.md`, `docs/api.md`, `docs/self-hosting/maps.md`, `docs/self-hosting/host-mode.md`; CHANGELOG `### Security`
- [x] 4.2 `go test ./...`, `make openspec-validate`
