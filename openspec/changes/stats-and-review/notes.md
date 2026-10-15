# Implementation notes

## Status (2026-10-15)

Done on `feat/stats-and-review`: 1.1 `lib/stats.ts`, 1.2 the shared fixture `internal/digest/testdata/stats_fixture.json` evaluated by `stats.test.ts`, 1.3 the `review` entity (schema, sync test, activity fixture case), 1.4 the client data layer (`Review`, defaults, `finishReview()`, Dexie v18, e2ee entity map), 1.5 export, own-export import and `docs/sync.md`, 3.1 `lib/review.ts`.

4.1–4.4 on top of `feat/outgoing-email` (this branch is stacked on it and merges after it): migration 0033 and `internal/digest` (store, the Go statistics port pinned by the shared fixture, `Build`, `Scheduler`), the `digest` mail kind in six languages with `carriesContent`, the settings routes, encryption turning the digest off, the scheduler on the jobs leader.

Held until the ux-overhaul group 1 and 2 PRs merge: 2.1–2.2, 3.2–3.4, 4.5, the docs that describe those screens, and the smoke test.

## Decisions taken while implementing

- Dexie version 18, not 17: `calendar-feeds` (earlier in the roadmap) takes 17 for its cache. When rebasing after it merges, v18 must also declare `calendarEvents` and `calendarSubscriptions`.
- `canEditProject` lives in `lib/review.ts` (role other than viewer); `lib/sharing.ts` has only `roleOf`.
- The `review` row's `completed_at` is `kNumber` with 0 for never, like `project_prefs.feed_seen_at`.
- Slipped for a running period counts due dates before today: a task due later today has not slipped yet.
- The digest also needs `OPENTODO_BASE_URL` for its review link: without it the route reports `available: false` with `unavailableReason: base_url_missing` and the scheduler sends nothing.
- `system` week start cannot be known on the server; the digest uses Monday for it.
- Digest dates are hand-written per language (`Fri 23 Oct`, `Fr. 23. Okt.`) because Go has no locale data; the six tables live in `internal/digest/build.go`.
- Digest sends skip the server-wide 100/hour window but keep the per-recipient one (`mail.Service.SendDigest`).

