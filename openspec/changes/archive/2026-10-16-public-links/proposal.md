# Proposal

## Why

Every way of showing someone a list today needs an account on the server: sharing adds an existing account by email (`internal/httpapi/sharing.go:88`), and a project invite link creates one (`internal/httpapi/projectinvites.go:27-35`). A visiting relative who should tick the shopping list, or a group chat that only needs to see the packing list, will not create an account for that. The anonymous preview of an invite link already shows that the server can serve one project's facts to someone without a session (`handlePreviewProjectInvite`, `internal/httpapi/projectinvites.go:196-220`); this change turns that into a real page.

## What Changes

- **Public links per project.** The project's owner or an admin creates a link from the Share dialog ("Share with a public link"): rights `view` (see the list) or `tick` (also complete and reopen tasks), an optional short name to tell links apart ("Grandma", "Group chat"), and an optional expiry (none by default, or 1, 7, 30 or 90 days). The secret is shown once and only a hash is stored. The dialog lists the project's active links with their name, rights, expiry and when each was last opened, and revokes them. Links are server-side data like invite links: never ops, never synced, and every action on them needs a connection.
- **The public page** (`/public/<secret>`): the project's name and its open tasks grouped by section, with subtasks under their parent, due date and priority, and the tasks completed in the last 24 hours shown ticked. A visible notice says that the list is public and, for tick links, that anyone with the link can tick items. No sign-in, no cookie, no local copy on the device: the page refreshes every 30 seconds while visible and after each tick, and says when it cannot reach the server. Titles are shown as plain text; notes, comments, labels, assignees and member names are never served.
- **A tick is an op.** Completing or reopening a task through a tick link is written through the op log as the link creator's account with device `public:<link-id>` and server time, exactly like an API or CalDAV write. A tick on a recurring task completes the occurrence the way an API completion does. Members' devices receive it on their next sync and converge by last-writer-wins. History labels the change "Public link (<name>)"; the activity feed and a task's activity show it as the link's event, never folded into the creator's own edits. Devices cannot forge the device id: `/api/v1/sync` refuses `public:` like `agent:` and `caldav:`.
- **Invalidation at use time.** Revocation, expiry, deleting or archiving the project, the creator losing the owner or admin role or being deactivated, and the creator enabling end-to-end encryption on an unshared project all make the link answer the same 404. A link for an unshared project of an encrypted account cannot be created (`encryption_enabled`).
- **Limits and hygiene.** 20 links per creator per hour; public reads and ticks rate limited per link and per client address, with unknown secrets charged to the sign-in limiter; public responses and the page carry `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`; audit events `public_link.created` and `public_link.revoked` (ticks are task edits and stay out of the audit log, like every other task edit); every public route refused on a demo instance.
- **Where members see it.** Besides the Share dialog, the project header shows a "Public" badge to the owner and admins while online, so a published list is never a surprise.

Out of scope:
- Guests adding, editing, reordering or deleting tasks, or commenting; links for Today, labels, saved views or dashboards; one link for several projects.
- Per-guest identity (names on ticks), passwords on links, or a live channel for the public page (it polls; `display-mode` covers the live case for signed-in screens, and may render a public link with its presentation).
- Sending the link anywhere: the creator copies it.
- Public links on end-to-end encrypted personal projects. The server cannot render ciphertext.

ROADMAP: advances "Next: Parity and depth" row 13, **Public and guest links** (`public-links`). Refinements of the row's notes: links get an optional name and an optional expiry (none by default, because a fridge list should not silently stop working), ticks include reopening so a mis-tap is reversible by the guest, and the "visible warning" is both on the public page and as a badge in the project header.

Nothing here is **BREAKING**: no new environment variable, no op field changes (the op log gains a device prefix, which is a convention on an existing string field), no dependency.

## Capabilities

### New Capabilities
- `public-links`: revocable links that let people without an account see one project or tick its tasks. Covers creation, listing and revocation, the public read and tick routes, invalidation, rate limits and indexing hygiene, the public page, the Share dialog section and the project badge.

### Modified Capabilities
- `http-api`: "Write-through to the operation log" gains the `public:<link-id>` device for ticks; "Sync endpoint" states that ops with a server-reserved device prefix (`agent:`, `caldav:`, `public:`) are refused.
- `activity-log`: "Activity events derived from operations" changes so an operation written through a public link forms its own event attributed to the link, never folded into the creator's edits, and carries the device it came from.
- `trash-and-history`: new requirement: public ticks are labelled in history ("Public link (<name>)" for the project's owner and admins, "Public link" for other members).
- `audit-log`: new requirement for `public_link.created` and `public_link.revoked`.
- `demo-mode`: new requirement: public link routes refused on the demo.
- `end-to-end-encryption`: new requirement: an encrypted account cannot publish an unshared project, and a published project that becomes encrypted stops answering.

## Impact

- **Server:**
  - migration `NNNN_public_links.sql` (the next free number): table `public_links`
  - `internal/auth/publiclinks.go`: create, list, revoke, lookup by hash, last-used stamp (same secret handling as `internal/auth/projectinvites.go:65-110`)
  - `internal/sync`: `PublicDevicePrefix` in `devices.go` (`ReservedDevice`, `internal/sync/devices.go:32-34`), a scope-bound read of one project without a session (`members.go` `projectRole`, `service.go` `List`/`Get` currently load access by user id, `internal/sync/service.go:670-731`), `ProjectStatus` reuse
  - `internal/httpapi/publiclinks.go`: three management routes under `/api/v1/projects/{id}/public-links`, two public routes under `/api/v1/public/{token}`, limiters, headers; `demo.go` deny list; `trash.go` history labels next to `labelAgentChanges` (`internal/httpapi/trash.go:62-92`); the web handler wrapper adds the robots and referrer headers for `/public/` pages
  - `internal/activity`: additive `device` on `Event` and the grouping rule (`internal/activity/activity.go:134-139`), shared fixture `testdata/activity_fixture.json`; `internal/httpapi/feed.go` and the activity routes resolve the link label
  - `internal/audit/events.go`: two names, detail keys `public_link_id`, `link_rights`
- **Web:** `router.ts` (`public` route), `App.tsx` (render before the auth gate, no sync, like `invite`), new `PublicListScreen`, `ShareDialog` section `PublicLinksSection` next to `InviteLinksSection` (`web/src/app/ShareDialog.tsx:87`), a badge in `ProjectHeader.tsx`, `lib/api.ts`, `lib/types.ts`, `lib/history.ts` `deviceLabel` (`web/src/lib/history.ts:31-39`), `lib/activity.ts` (device on events), `FeedView`/`ProjectActivity`/`TaskConversation` actor label, audit labels.
- **API:** five new routes, error codes reused (`invitation_invalid` is not reused: public links answer `link_invalid`), `rate_limited`, `encryption_enabled`, `forbidden`, `not_found`.
- **Docs:** `docs/sharing.md` (new section, `public-links` in its `specs:` so the docs check covers the capability), `docs/api.md`, `docs/self-hosting/demo.md` (switched-off list), `docs/trash-and-history.md` (history label), CHANGELOG.
- **Size:** no dependency. About 700 lines of Go and 500 of TSX plus tests; the main bundle grows by about 5 kB gzipped (the public screen is small and shares the row styles), the binary by the embedded assets plus a few kB of Go. Runtime memory: two rate limiter maps.
