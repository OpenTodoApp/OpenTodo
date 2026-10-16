# Tasks

## 1. Store and secrets (design D1, D5)

- [x] 1.1 Add migration `NNNN_public_links.sql` (the next free number) creating `public_links` with the columns of design D1 and a unique index on `token_hash`. Verify with `go test ./internal/store/...` (migration applies on a fresh database and twice without error).
- [x] 1.2 Add `internal/auth/publiclinks.go`: `CreatePublicLink` (secret `otl_` + `ids.Secret(32)`, hash stored, audit event in the same transaction), `ListPublicLinks` (active only), `RevokePublicLink`, `LookupPublicLink` (by hash, constant-time compare, returns creator role and deactivation flag), `TouchPublicLink` (at most once a minute); deactivating an account revokes its links. Verify with `go test ./internal/auth/...` covering create/list/revoke, expiry, the once-a-minute stamp and revocation on deactivation.
- [x] 1.3 Add `public_link.created` and `public_link.revoked` to `internal/audit/events.go` with detail keys `public_link_id` and `link_rights`, and the client labels in `web/src/app/auditFormat.ts`. Verify with `go test ./internal/audit/...` (names known, keys allowed) and `npm test` in web/.

## 2. Reading and ticking without a session (design D3, D4)

- [x] 2.1 Add `PublicDevicePrefix`, `PublicDevice(linkID)` and the prefix to `ReservedDevice` in `internal/sync/devices.go`; extend the sync route's refusal message. Verify with `go test ./internal/httpapi/...` (a `POST /api/v1/sync` with device `public:abc`, and one with an op carrying it, both answer 400 `invalid_op`).
- [x] 2.2 Add `sync.Service.PublicProject(ctx, creatorID, projectID)` in `internal/sync` (scope via `projectRole`, project fields, sections, tasks by `project_id`, tombstones dropped, completed kept for 24 h). Verify with `go test ./internal/sync/...` for an unshared project, a shared project, a project the creator no longer administers (error), and a deleted task (absent).
- [x] 2.3 Add `internal/httpapi/publiclinks.go` with the three manager routes (`projectManager`, `requireFresh` on create, `encryption_enabled` for unshared projects of encrypted creators, 20/hour limiter) and register them. Verify with `go test ./internal/httpapi/...` (`TestPublicLink*`: owner, admin, viewer 403, stranger 404, anonymous 401, read and agent token 403, invalid input per field, rate limit, encrypted refusal).
- [x] 2.4 Add the public read route with `usablePublicLink` (design D5), the field projection, `last_used_at` stamping, per-link and per-address limiters, unknown secrets charged to the sign-in limiter, and the robots, referrer and `no-store` headers. Verify with `go test ./internal/httpapi/...` covering a valid link (no `description`, `labels` or `assignee_id`, no `Set-Cookie`), the uniform 404 for revoked, expired, archived, deleted, demoted and deactivated cases, the session-ignored case, and the limiter.
- [x] 2.5 Add the tick route: rights check, task membership check, `RecurringCompletion` on completion, ops with `opTS()` and the public device, `ApplyStrict` as the creator, `NotifyApplied`. Verify with `go test ./internal/httpapi/...` covering tick and reopen (op device and actor as expected), a recurring task (occurrence record and moved due), a view link (403), a task of another project (404), a bad body (400), and that a device syncing afterwards receives the op.
- [x] 2.6 Extend `redactPath` with the `otl_` prefix and wrap the web handler so `GET /public/...` pages carry `X-Robots-Tag` and `Referrer-Policy: no-referrer`. Verify with `go test ./internal/httpapi/...` (log line redacted; headers on the page response and absent on `/inbox`).
- [x] 2.7 Add the demo deny rules for `/api/v1/projects/{id}/public-links` and `/api/v1/public` (every method) and list the feature in `docs/self-hosting/demo.md`. Verify with `go test ./internal/httpapi/...` (`TestDemo*` refusal on both prefixes) and `make docs-check`.
- [x] 2.8 Document the five routes, error codes and limits in `docs/api.md` (a "Public links" section after "Project invite links"). Verify with `make docs` (no diff on a second run) and `make docs-check`.

## 3. Attribution (design D6)

- [x] 3.1 Add the additive `device` field to `internal/activity.Event` and the grouping rule for `public:` devices; add the "public tick next to the creator's edit" case to `internal/activity/testdata/activity_fixture.json`. Verify with `go test ./internal/activity/...`.
- [x] 3.2 Mirror both in `web/src/lib/activity.ts` and `ActivityEvent` in `web/src/lib/types.ts`; local derivation shows "Public link" as the actor label for such events in `TaskConversation`, `ProjectActivity` and `FeedView`. Verify with `npm test` in web/ (the shared fixture passes in TypeScript) and `npm run build`.
- [x] 3.3 Label history change sets with a `public:` device in `internal/httpapi/trash.go` ("Public link (<name>)" for the project's owner and admins, "Public link" otherwise) and resolve `actorName` the same way on the activity and feed routes. Add the `public:` fallback to `deviceLabel` in `web/src/lib/history.ts`. Verify with `go test ./internal/httpapi/...` (owner, editor and revoked-link labels; unauthenticated 401) and `npm test` in web/.
- [x] 3.4 Document the history label in `docs/trash-and-history.md` and the feed wording in `docs/sharing.md`. Verify with `make docs-check`.

## 4. Public page (design D8)

- [x] 4.1 Add the `public` route to `web/src/app/router.ts`, render `PublicListScreen` before the auth gate in `App.tsx` with sync kept off, and add `publicApi` (`credentials: 'omit'`) to `web/src/lib/api.ts`. Verify with `npm test` in web/ (route parsing, a test showing no sync starts on the route).
- [x] 4.2 Build `PublicListScreen`: warning banner per rights, sections and nested subtasks, due and priority chips, 44 px checkboxes for tick links, refetch after a tick with error recovery, 30 s polling only while visible, "Updated …" line, offline, invalid and rate-limited states, screen id `public/list`. Verify with vitest component tests for the five states and a keyboard tick (Tab, Space), plus an axe check, and `npm run build`.
- [x] 4.3 Add the screen to the layout check at 360, 390 and 768 px in light and dark. Verify with `make layout-check`.

## 5. Share dialog and badge (design D8)

- [x] 5.1 Build `PublicLinksSection` (rights, name, expiry, create, created link shown once with Copy, active list with last-opened and Revoke, offline disabled, hidden on the demo) and mount it in `ShareDialog`. Verify with a vitest `publicLinks.test.tsx` covering create and copy, the list, revoke, the viewer seeing no section and the offline notice.
- [x] 5.2 Add the "Public" badge to `ProjectHeader` for owner and admins while online, opening the dialog on the section; refresh it when the dialog closes. Verify with a component test (badge after a created link, gone after revocation, absent offline).
- [x] 5.3 Write the "Share with a public link" section of `docs/sharing.md`, add `public-links` to its `specs:` front matter and `share-dialog#share-with-a-public-link` to `screens:`, and regenerate the help bundle. Verify with `make docs` and `make docs-check` (the new capability is covered).

## 6. Integration

- [x] 6.1 Manual smoke on `make dev`: create a tick link, open it in a private window on a phone-sized viewport, tick and reopen a task, see the change on the signed-in tab within a sync, check the history label and the feed entry, revoke the link and reload the public page. Record the result in the change folder notes.
- [x] 6.2 Run `make check` (lint, Go and web tests, UI lint, docs check, OpenSpec validation). Verify it passes.

## Workflow follow-up

- Add a ROADMAP.md row under "5. Collaboration": "Public and guest links per project | `public-links`" and remove row 13 from "Next: Parity and depth".
- Add a CHANGELOG.md entry under Unreleased (Added: public links; the `public:` device prefix in history and activity).
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes, and add `public-links` to the `specs:` front matter of `docs/public-links.md` (the docs check only accepts capabilities under `openspec/specs/`, so the page lists none until the archive).
