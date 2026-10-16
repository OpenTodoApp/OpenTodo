# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Every read of synced data is bound to an account.** `sync.Service.List` and `Get` call `loadAccess(userID)` and read `scope_fields` for that user's scopes (`internal/sync/service.go:670-731`, `scope.go:52-73`). There is no reader for "one project, no session". A project lives in `project:<id>` once shared, otherwise in its owner's `user:<id>` scope with its tasks and sections keyed by their `project_id` field (`scope.go:19`, `:209-220`).
- **Every write is an op authored by a user.** `ApplyStrict(ctx, userID, ops)` resolves scope and role per op (`service.go:173-175`, `scope.go:263-305`); REST writes stamp server time and device `server` (`internal/httpapi/server.go:120-124`), CalDAV `caldav:<app-password-id>`, assistants `agent:<token-id>`. `/api/v1/sync` refuses the server-only prefixes (`server.go:958-968`, `internal/sync/devices.go:32-34`).
- **Project invite links are the precedent for anonymous, token-keyed routes:** hashed secrets with a recognisable prefix (`internal/auth/projectinvites.go:65-110`), use-time re-checks of the creator's rights and the project's state (`internal/httpapi/projectinvites.go:146-192`), the sign-in limiter on the anonymous route (`:196-220`), path redaction in the request log (`:325-337`), demo deny list entries (`internal/httpapi/demo.go:112-140`) and audit events with allow-listed keys (`internal/audit/events.go:141-170`, `:335-351`).
- **Attribution of server-side writers exists in two places:** history labels computed at read time from the device prefix (`internal/httpapi/trash.go:62-92`, `internal/sync/trash.go:46-55` `DeviceLabel`, `web/src/lib/history.ts:31-39`), and activity events, which carry an actor but no device and group ops by `actor + entity + id` within 5 s (`internal/activity/activity.go:52-67`, `:134-139`; `web/src/lib/activity.ts`, `web/src/lib/types.ts:250-266`).
- **The web app is cookie-only** (`web/src/lib/api.ts:71-77`), the SPA serves `index.html` for any unknown path (`internal/web/web.go:41-82`), and `App.tsx` renders the invite screens before the auth gate and keeps sync off on those routes (`web/src/app/App.tsx:102`, `:160-190`).
- **Completion on the server has one helper:** `RecurringCompletion` turns a completing write into "record the occurrence, move the series" for REST, CalDAV and assistants (`internal/sync/recurring.go:48-55`).

## Goals / Non-Goals

**Goals:**
- One table, five routes, no new auth concept: a public link is a capability token for one project, checked on every use.
- The public page is a thin client of one read route: no IndexedDB, no sync, no cookie, no shared code path with the signed-in shell beyond row styles and icons.
- Ticks are ordinary ops, so convergence, history, activity, webhooks and backups need no special case; only attribution learns a new device prefix.

**Non-Goals:**
- A live channel for guests. The page polls; `Notifier` subscriptions are per account (`internal/sync/notifier.go:35-47`) and a per-link stream would need its own connection caps.
- Serving anything beyond titles, dates, priorities and structure. Notes, comments and labels never leave the server through a public route.

## Decisions

### D1. Table `public_links`, invite-link secret handling

Migration `NNNN_public_links.sql` (the next free number, idempotent statements):

| column | meaning |
| --- | --- |
| `id` | link id (ULID); shown to managers and used in the device id, never to guests |
| `token_hash` | SHA-256 of the secret (`hashToken`), unique, indexed |
| `project_id` | the project (an op-log entity, so no foreign key) |
| `created_by` | creator, `REFERENCES users ON DELETE CASCADE` |
| `rights` | `view` or `tick` |
| `name` | optional label, at most 60 characters, nullable |
| `created_at`, `expires_at` | Unix ms; `expires_at` nullable (no expiry) |
| `revoked_at` | revocation marker |
| `last_used_at` | Unix ms, stamped by public requests at most once a minute |

Secrets are `otl_` + 32 random bytes URL-safe base64 (`ids.Secret(32)`); the `ot` prefix means `redactPath` (`internal/httpapi/projectinvites.go:325-337`) only needs the new prefix added. Lookup is by hash plus `crypto/subtle.ConstantTimeCompare` on the stored hash, as for invites. A link is active when `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)`.

- **Alternative: a `kind` column on `project_invites`.** Rejected: invites are single-use and spent; public links are reusable and expire optionally. Mixing the status rules in one table would complicate both lists.
- **Alternative: a per-link guest account with a `viewer` membership.** Rejected: it creates account rows that show up in member lists, cannot tick (viewers write nothing, `scope.go:109-121`), and would leave a dangling user per revoked link.

**Data model impact:** one new table. No op field is added or renamed; the op log gains the device prefix `public:<link-id>` on existing `device` strings. Links are never synced or exported, so offline behaviour and convergence are unaffected.

### D2. Routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/projects/{id}/public-links` | session or full token, fresh session, project owner/admin | create `{rights, name?, expiresInDays?}` → 201 `{link: {...}, url}` (`url` carries the secret once) |
| GET | `/api/v1/projects/{id}/public-links` | project owner/admin | active links `{links: [...]}` |
| DELETE | `/api/v1/projects/{id}/public-links/{linkId}` | project owner/admin | revoke → 204 |
| GET | `/api/v1/public/{token}` | none | the list |
| POST | `/api/v1/public/{token}/tick` | none; the link's `tick` rights | `{taskId, completed}` → 200 `{taskId, completed_at}` |

The manager routes reuse `projectManager` (`internal/httpapi/projectinvites.go:50-63`) and `requireFresh` on create, since publishing a list is as sensitive as inviting. `requireAuth` already refuses `read` and `agent` tokens on writes. The public routes are registered with `mux.HandleFunc` like the invite preview and never call `authenticate`: a session cookie, if present, is ignored, so the response is identical for everyone (one less thing to leak). Responses set `Cache-Control: no-store`.

The page path is `/public/<secret>`: self-describing when pasted into a chat, and the secret's `otl_` prefix tells a reader what it is. The SPA already serves `index.html` for it; the router gains `{view: 'public', token}`.

### D3. Reading one project without a session

New `sync.Service.PublicProject(ctx, creatorID, projectID) (PublicProject, error)`:

1. `projectRole(creator, projectID)` (`internal/sync/members.go:134-160`) gives the scope: `project:<id>` when shared, else `user:<creator>` when the creator owns it live; any other outcome is "invalid" to the handler.
2. In that scope, materialise the project's `name`, `color`, `archived`, `deleted_at`; the sections whose `project_id` is the project; and the tasks whose `project_id` field equals the project id (`SELECT entity_id FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND field = 'project_id' AND value = ?`, then their fields). Tombstoned entities are dropped; tasks are kept when `completed_at` is null or within the last 24 hours.
3. The handler projects each task to `id, title, due, priority, section_id, parent_id, position, completed_at` and each section to `id, name, position`. Nothing else is copied, so a new content field added to the schema later is not exposed by default.

- **Alternative: `List(creatorID, "task")` and filter by project.** Rejected: it materialises the creator's whole personal scope and every shared project on each poll; a fridge page polls every 30 seconds.
- **Alternative: the server renders HTML.** Rejected: the app's CSP, tokens and dark mode live in the SPA; a second rendering path would drift.

The archived check is deliberate: an archived project is "done" and its owner would not expect a fridge list to keep showing it.

### D4. A tick is an API write by the creator

`handlePublicTick`:

1. Resolve the link, run the use-time checks of D5, require `rights = tick`.
2. `PublicProject` must contain the task (open or completed within 24 hours); otherwise 404 `not_found`.
3. Build the body `{completed_at: now}` or `{completed_at: null}`; for a completion run `RecurringCompletion` with the server's local date, exactly as `handlePatch` does (`internal/httpapi/server.go:1366`, `recurring.go:48-55`), so a repeating shopping list rolls forward.
4. Turn the body into ops with `opTS()` and device `opsync.PublicDevice(linkID)` (`"public:" + id`), apply with `ApplyStrict(ctx, creatorID, ops)` and wake devices with `NotifyApplied(res, device)`.

The creator is the author because the op log requires an account (`ops.user_id REFERENCES users`, `internal/store/migrations/0001_init.sql:30`) and because the creator is who vouched for the link. Owners and admins may always write tasks (`CanWrite`, `scope.go:109-121`), and D5 guarantees the creator still holds one of those roles, so `ApplyStrict` cannot refuse for rights; a refusal is reported as 500 and logged, since it would mean the checks and the resolver disagree.

`PublicDevicePrefix = "public:"` joins `ReservedDevice` (`internal/sync/devices.go:32-34`), so the sync route's existing check refuses forged guest ops with the same `invalid_op` and a message naming the three prefixes.

- **Alternative: a dedicated "guest" actor id.** Rejected: `Actor` must be a user id for the foreign key and for every reader that resolves names.

### D5. Use-time checks, uniform 404

`usablePublicLink` mirrors `usableProjectInvite` (`internal/httpapi/projectinvites.go:146-160`): active row; creator not deactivated; `ProjectStatus(creator, project)` live and shared-or-owned with role owner or admin; project not archived; and, when unshared, the creator's encryption status off (`encryptionEnabled`, `internal/httpapi/encryption.go:49`). Every failure is 404 `link_invalid` with one message, so a guest learns nothing about why. The row is not deleted on failure: unarchiving the project or restoring the role makes the link work again, which is what a household expects.

Deactivating an account revokes its links in the same transaction, as `projectinvites.go` does for invite links; deleting an account cascades.

### D6. Attribution in history and activity

- **History** (`internal/httpapi/trash.go:62-92`): change sets whose device starts with `public:` get `DeviceLabel` "Public link (<name>)" when the viewer is the project's owner or admin and the link row still exists with a name, otherwise "Public link". The client's `deviceLabel` (`web/src/lib/history.ts:31-39`) adds the `public:` fallback "a public link" for pages without a server label (there are none today, but the fallback keeps old servers readable).
- **Activity events gain an additive `device` field** (`internal/activity.Event`, `ActivityEvent` in `web/src/lib/types.ts`): the device of the group's first op. The grouping key becomes `actor + entity + id`, plus the device when it starts with `public:`, so a guest's tick never merges with the creator's edit seconds earlier. The shared fixture gets a case for exactly that (the delta spec's scenario). Existing cases are unaffected because none uses a `public:` device.
- **Names:** the server pages (`/tasks/{id}/activity`, `/projects/{id}/activity`, `/activity`) set `actorName` to "Public link (<name>)" or "Public link" for such events, looked up once per page by link id. Local derivation (no link table on devices) shows "Public link". The feed's actor filter keeps matching the creator's id; the rows still read "Public link", and a separate filter value is left for later.
- Nothing is emitted to `internal/notify`: a tick assigns nobody and mentions nobody.

### D7. Limits and hygiene

- Limiters: `publicLinkCreate` 20/hour per creator; `publicRead` 120/minute per link id; `publicTick` 60/minute per link id; `publicAddr` 120/minute per client address; an unknown or inactive secret is charged to `s.limiter` (the sign-in limiter, 10/minute per address) before any other work, as the invite preview does.
- Headers: the public API handlers set `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. For the page, `New()` wraps the web handler (`internal/httpapi/server.go:276-278`) so a `GET /public/...` response carries the same robots and referrer headers while every other page keeps `Referrer-Policy: same-origin` (`:445-457`). The CSP is unchanged; the page is same-origin.
- `last_used_at` is written at most once per minute per link (compare before update), so polling does not turn into a write per request.
- The request logger records the path through `redactPath`, extended with the `otl_` prefix.

### D8. Client

- **Route and gate:** `router.ts` parses `/public/<secret>`; `App.tsx` renders `PublicListScreen` before the auth gate and adds `public` to the routes that keep `startSync` off (`web/src/app/App.tsx:102`). The screen fetches with `credentials: 'omit'` through a tiny `publicApi` in `lib/api.ts`, so the no-cookie contract is explicit even on a browser that holds a session.
- **`PublicListScreen`:** states loading, ready, offline (keeps the last list, "Could not refresh" line, retries on `online`), invalid, rate-limited. Ready shows the project name, a warning banner (`role="note"`, warning tokens) with the rights sentence, sections in position order with their tasks, subtasks nested one level under their parent, due label through `describeDue`, priority through the existing row chip, and for tick links a 44 px checkbox per task that posts the tick and refetches; a failed tick restores the box and shows the error. A `setInterval` of 30 s runs only while `document.visibilityState === 'visible'`. The "Updated 12:03" line uses `formatInstant` with system preferences (no user prefs exist for a guest). Dark mode follows the system through the existing tokens. Screen id `public/list` for the layout check.
- **Share dialog:** `PublicLinksSection` next to `InviteLinksSection` (`web/src/app/ShareDialog.tsx:87`): rights radio (view, tick), name field, expiry select (none, 1, 7, 30, 90 days), create; created link shown once with Copy; active links with name, rights, expiry, "last opened" and Revoke; disabled offline with a line. Hidden on the demo.
- **Badge:** `ProjectHeader` fetches the list once per project open when online and the cached membership role is owner or admin, and shows "Public" (an `Icon` plus text) that opens the share dialog on the public links section. It is in-memory state; closing the dialog refreshes it.

### D9. Audit and demo

Catalogue names `public_link.created` and `public_link.revoked`, detail keys `public_link_id` and `link_rights` added to the allow-list, `shared_project_id` reused. Ticks are not audited: they are task edits, and the audit spec keeps those out. Demo rules: `{"Public links", false, projectPublicLinks}` and `{"Public links", false, prefix("/api/v1/public")}` (every method), and `docs/self-hosting/demo.md` lists it.

### Interface budget (added after ux-overhaul)

- The share dialog gains one section, for owners and admins.
- The project header gains a "Public" chip in its meta slot, not a new row.
- The public page sits outside the shell, like the invite and reset screens.
- No new scroll region, sidebar destination, task property, list chrome or shortcut.

## Risks / Trade-offs

- **[A link leaks beyond the intended people]** → Revocation is one click in the share dialog, "last opened" shows unexpected use, the badge keeps publication visible, and a tick link can only complete or reopen tasks, never read notes or write content.
- **[Guessing secrets]** → 256-bit secrets, hashed at rest, unknown secrets charged to the sign-in limiter per address.
- **[A public page as a load vector]** → Per-link and per-address limits; the read is two indexed queries on `scope_fields` plus a projection; `no-store` keeps proxies from caching a secret URL.
- **[Grouping rule change in activity]** → Only ops with a `public:` device change groups; the fixture pins both the old cases and the new one in Go and TypeScript.
- **[Ciphertext served to a guest]** → Creation refused for unshared projects of encrypted accounts, and the use-time check turns a later enablement into `link_invalid`.
- **[Attribution shows the creator as actor in older clients]** → The op's `actor` is the creator; a client without this change labels the change "another device (publ)". Harmless, and fixed by updating the app.
- **[A guest reopens a task someone else completed]** → Limited to tasks completed in the last 24 hours and visible in the feed as the link's event.

**Size:** no dependency. About 700 lines of Go (store, routes, reader, labels, tests) and 500 of TSX; about 5 kB gzipped more in the main bundle. The binary grows by the embedded assets and a few kB of Go. Memory: four small limiter maps.

## Migration Plan

The migration adds one empty table. No data changes. Rollback is shipping the previous binary: it ignores the table, the public routes answer 404 `not_found`, and ops with a `public:` device stay in the log and render in history as "another device". No environment variable is read.

## Open Questions

- Should the feed offer "Public links" as an actor filter value later? It needs no spec change here: the events already carry the device, and a filter value can be added to the feed's actor list when someone asks.
