## 1. Build

- [x] 1.1 `sync.ts`: `reservedDevice` (the copy of `ReservedDevice`) and the rewrite of reserved devices to this device where the outbox batch is sent
- [x] 1.2 Tests: a re-seed holding fields written by `server` and `agent:` completes against a server that refuses reserved devices; an outbox an earlier build left with `server` and `caldav:` ops is sent
- [x] 1.3 Shared vectors `internal/sync/testdata/reserved_devices.json`, read by `TestReservedDeviceVectors` and `reservedDevice.test.ts`; `docs/contracts.md` row
- [x] 1.4 Docs (`docs/sync.md` log generation), changelog fragment

## 2. Checks

- [x] 2.1 Web typecheck, lint and tests; `go test ./internal/sync`; `make openspec-validate`; `make repo-check`
- [x] 2.2 End to end: the real server, a REST task synced into Chromium, the generation changed, a restart. On main every exchange answers 400 and a later REST task never arrives; with the change, no 400 and it arrives
