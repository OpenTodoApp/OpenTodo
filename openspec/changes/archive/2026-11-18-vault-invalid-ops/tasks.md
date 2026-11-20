## 1. Build

- [x] 1.1 `ot vault` announces `invalid_ops`; a test against the real server where one op is refused as `invalid` and the rest applies
- [x] 1.2 The Obsidian plugin announces `invalid_ops` on the push-only exchange and its vault sync; an outbox test where one entry is refused and the next is sent
- [x] 1.3 `go test ./internal/vault ./internal/cli`, `make obsidian`, `make openspec-validate`
