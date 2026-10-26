# Clocks follow the operations they receive

## Why

An internal audit (finding F3) found that the client's hybrid clock never moved past the timestamps of operations it received. A device whose clock runs behind a writer's, by less than the two seconds no offset corrects, stamped its next change of the same field earlier than the value it replaced, so the change lost last-writer-wins here and on the server. With end-to-end encryption the encrypt-on-sight rewrite of a plaintext value could tie with or lose to the plaintext op, which then stayed on the server. The `ot vault` clock and the server's own clock had the same gap.

## What Changes

- Web client: every operation applied from the server moves the clock to at least its timestamp, and the stored seed follows, so a reload and the service worker keep it.
- `ot vault`: every pulled operation moves the vault's clock the same way.
- Server: every stored operation moves the server clock (`ServerTS`), and the clock starts from the newest stored operations when the process starts.

Not **BREAKING**: no op, field, API or environment change. Out of scope: correcting a device clock that runs behind by less than two seconds (the receive rule makes it harmless). Advances no ROADMAP item; a fix for the 0.14.1 security release.

## Impact

- `web/src/lib/hlc.ts` (`hlcReceive`), `web/src/lib/ops.ts` (`applyOps`), `internal/vault/exchange.go`, `internal/sync/clock.go`, `internal/sync/apply.go`, `internal/sync/service.go`.
- Tests: `hlc.test.ts`, `ops.test.ts`, `e2ee.test.ts`, `internal/sync/convergence_test.go` (and the property test's device model), `internal/vault/sync_test.go`.
- `docs/sync.md` "Clocks", CHANGELOG.
