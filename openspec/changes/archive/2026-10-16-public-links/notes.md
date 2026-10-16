# Implementation notes

## Status (2026-10-15)

Done on `feat/public-links`: 1.1–1.3 (migration 0032, `internal/auth/publiclinks.go`, audit events and labels), 2.1–2.8 (reserved `public:` device, `sync.Service.PublicProject`, the manager, list and tick routes with use-time checks and limits, redaction and page headers, demo rules, `docs/api.md`), 3.1 (the activity `device` field and grouping, shared fixture case), 3.3 (history and activity labels), the web data layer for 3.2 and 4.1 (`ActivityEvent.device`, the `public:` history fallback, `PublicLink`/`PublicList` types, `api.listPublicLinks`/`createPublicLink`/`revokePublicLink`, the cookie-less `publicApi`), and 3.4's docs (history wording in `docs/trash-and-history.md`, feed wording in `docs/sharing.md`; 3.4 stays unticked until the screens it describes exist).

Held until the ux-overhaul group 1 and 2 PRs merge: the "Public link" actor label in `TaskConversation`, `ProjectActivity` and `FeedView` (3.2), the router entry and `PublicListScreen` (4.x), the share-dialog section and header badge (5.x), and the smoke test.

## Decisions taken while implementing

- Migration 0032: first written as 0034 (leaving 0032–0033 for outgoing-email and stats-and-review), renumbered to the next free number when merging main, which ends at 0031 (calendar-feeds).
- The create response is the link object plus `link` (the URL with the secret), as the spec's scenario reads, rather than design D2's `{link: {...}, url}`.
- `expiresInDays` accepts any whole number from 1 to 90 (the spec's rule); the share dialog offers 1, 7, 30 and 90.
- The activity event carries `device` only for `public:` groups, so every existing fixture case and client stays unchanged.
- The client history label skips the "author · " prefix for `public:` change sets: they are written as the creator, but the version names the link.

## Screens (2026-10-16)

- Done after ux-overhaul landed: `PublicListScreen` at `/public/<secret>` (rendered before the sign-in state is known, never starts sync, on the page-template test's `OUTSIDE_SHELL` list), `PublicLinksSection` in the share dialog (owner and admins, not on the demo), the "Public" badge in the project header, and the "Public link" actor in the task's Activity tab, project activity and Updates.
- In a task's history, a public link's tick is shown with the link's label alone ("Public link (Grandma)"). The ops are authored as the link's creator, so the previous "You · Public link (…)" credited the guest's tick to the member.
- A public tick never joins the creator's own run in the Activity tab (`groupRuns` compares the device too).

## Smoke test (2026-10-16, task 6.1)

Ran `./bin/opentodo` on 127.0.0.1:18080 with `OPENTODO_BASE_URL` set, and a "Groceries" project with three tasks. The browser was headless Chromium.

- **Create.** Share → Share with a public link, named "Family chat", "Can tick items", Create. The link `http://127.0.0.1:18080/public/otl_…` was shown once, and the header showed the **Public** badge after closing the dialog.
- **Guest on a phone.** A fresh browser context at 360 × 740 showed three rows with the tick notice, 52 px checkbox targets and no horizontal overflow. Ticking "Bread" saved at once.
- **Owner's tab.** Within a sync, the owner saw the task completed. Its Activity tab read "Public link completed", and its History showed "Public link (Family chat)". The Updates feed covers shared projects only and this project was not shared; the same `isPublicEvent` path renders the feed line, covered by unit tests.
- **Revoke.** Revoking from the badge, then reloading the guest page, showed "This link no longer works".

## Merge with main (2026-10-16)

- Main had split `docs/sharing.md` and `docs/trash-and-history.md` into hubs with sub-pages under 600 words. The "Share with a public link" guide is now its own page, `docs/public-links.md` (order 74, under the Sharing hub in `docs/README.md`), with a one-sentence pointer and the `#share-with-a-public-link` anchor on the hub; the history label is on `docs/task-history.md` and the Updates wording on `docs/comments-and-activity.md`. The page lists no `specs:` until the change is archived (see the workflow follow-up).
- The share dialog's section and the public page use the `ui` primitives and tokens (`Button`, `Field`, `Input`, `Select`, `Notice`, `ConfirmDialog`; `text-body`/`text-meta`/`text-hint`, `rounded-card`/`rounded-control`/`rounded-chip`), and the Public badge sits in the project `PageHeader`'s `meta` slot next to the member avatars.
