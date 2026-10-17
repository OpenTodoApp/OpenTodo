# Tasks: sync-convergence

## 1. Clock skew (CORE-2, DATA-2)
- [x] 1.1 `Apply` refuses ops more than `MaxFutureSkewMs` ahead with `clock_skew` and `serverTime` when the context carries `WithClockSkewRefusal`; clamps otherwise
- [x] 1.2 `/api/v1/sync` reads `features` and sets the refusal for `clock_skew`
- [x] 1.3 Client: `hlc.ts` resets the offset within tolerance, caps a far-future seed, `hlcClockRefused`; `clockSkew.ts` re-stamps and re-queues refused ops; `sync.ts` and `api.ts` announce the features
- [x] 1.4 Tests: Go refusal and fast-clock convergence; web hlc and re-stamp

## 2. One server clock (CORE-13)
- [x] 2.1 `Service.ServerTS`/`ServerTSAt` used by REST, assistant tools, push, importer, email and membership
- [x] 2.2 `ServerDevice = server:<boot id>`, `IsServerDevice` in reserved devices, `uploaded_at`, webhook source and history label
- [x] 2.3 Tests

## 3. Confirmed backfill pages (CORE-11)
- [x] 3.1 Migration `0037_backfill_confirm.sql`; `PullWith` with `PullOptions`; `backfillSeq`/`backfillAck` on the wire; client echoes it
- [x] 3.2 Test: a lost page is served again

## 4. Account deletion unassigns (CORE-9)
- [x] 4.1 `Service.DeleteAccountData` unassigns in other owners' projects; observer after commit
- [x] 4.2 Test

## 5. Post-commit context (CORE-10)
- [x] 5.1 `context.WithoutCancel` for observers and sinks after commit
- [x] 5.2 Test with a context cancelled after commit

## 6. Due values (CORE-14)
- [x] 6.1 `kDue` parses date and time
- [x] 6.2 Test

## 7. Migrations (CORE-12)
- [x] 7.1 `schema_migrations` recorded and backfilled; error log for a skipped file
- [x] 7.2 Repo check against `origin/main`
- [x] 7.3 Tests

## 8. Docs and changelog
- [x] 8.1 docs/sync.md, docs/api.md, docs/architecture.md
- [x] 8.2 CHANGELOG
