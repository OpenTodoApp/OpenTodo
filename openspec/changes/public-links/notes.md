# Implementation notes

## Status (2026-10-15)

Done on `feat/public-links`: 1.1–1.3 (migration 0034, `internal/auth/publiclinks.go`, audit events and labels), 2.1–2.8 (reserved `public:` device, `sync.Service.PublicProject`, the manager, list and tick routes with use-time checks and limits, redaction and page headers, demo rules, `docs/api.md`), 3.1 (the activity `device` field and grouping, shared fixture case), 3.3 (history and activity labels), the web data layer for 3.2 and 4.1 (`ActivityEvent.device`, the `public:` history fallback, `PublicLink`/`PublicList` types, `api.listPublicLinks`/`createPublicLink`/`revokePublicLink`, the cookie-less `publicApi`), and 3.4's docs (history wording in `docs/trash-and-history.md`, feed wording in `docs/sharing.md`; 3.4 stays unticked until the screens it describes exist).

Held until the ux-overhaul group 1 and 2 PRs merge: the "Public link" actor label in `TaskConversation`, `ProjectActivity` and `FeedView` (3.2), the router entry and `PublicListScreen` (4.x), the share-dialog section and header badge (5.x), and the smoke test.

## Decisions taken while implementing

- Migration 0034: 0031–0033 belong to calendar-feeds, outgoing-email and stats-and-review, which come earlier in the roadmap.
- The create response is the link object plus `link` (the URL with the secret), as the spec's scenario reads, rather than design D2's `{link: {...}, url}`.
- `expiresInDays` accepts any whole number from 1 to 90 (the spec's rule); the share dialog offers 1, 7, 30 and 90.
- The activity event carries `device` only for `public:` groups, so every existing fixture case and client stays unchanged.
- The client history label skips the "author · " prefix for `public:` change sets: they are written as the creator, but the version names the link.
