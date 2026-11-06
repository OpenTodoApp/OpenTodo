## 1. Server

- [x] 1.1 `relay.Call.Args`; `Registry.Call` keeps the call's arguments (compact, at most 300 bytes) for every relay request of the call, reads and writes; verify `TestRelayRequestsNameTheCall` (`go test ./internal/agenttools`) and `TestRequestCarriesTheCall` (`go test ./internal/relay`)
- [x] 1.2 The `declined_on_device` message covers reads; verify `TestRelayErrorsWriteNothing` and `go test ./internal/agenttools`

## 2. Device

- [x] 2.1 `answer()` refuses a request without a tool, publishes the call it answers, and with **Confirm reads first** decrypts, asks and sends only on Allow; verify `npm test` (`relayCalls.test.ts`, `relay.test.ts`)
- [x] 2.2 `RelayConfirm` shows reads and writes with the connector, tool and arguments; `RelaySettings` has the option, the connector in the recent list and the footer label; strings in the six catalogues; verify `npm test` (`relayReads.test.tsx`, `relay.test.tsx`), `make i18n-check`, `make ui-lint`, `npm run build`

## 3. Docs and checks

- [x] 3.1 `docs/mcp.md`, `docs/e2ee.md`, `docs/security/threat-model.md`, CHANGELOG `### Security`; verify `make docs-check`
- [x] 3.2 `go test ./...`, `make openspec-validate`, `make check` where it runs
