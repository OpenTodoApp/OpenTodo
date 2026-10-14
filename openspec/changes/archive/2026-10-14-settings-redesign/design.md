# Design: settings-redesign

## Context

- `settingsSections.ts` is a single table that the overview, side navigation, section pages and tests all read (id, label, description, `visible`, `demo`, `demoOnly`). `router.ts` keeps `SETTINGS_SECTION_IDS` and parses `/settings/<id>`. `SettingsView.tsx` renders the overview, the side navigation (≥1024 px), and a `SectionContent` switch that mounts panels per section.
- Panels are already split into an effectful container and a pure `*View` (for example `TwoFactorPanelView`, `SecurityPanelView`, `UsersView`, `ActivityView`). Tests render the views to static markup. This split is what makes the redesign tractable: layout changes stay in the views, and data loading stays where it is.
- Every panel heading is a `HelpHeading` with a stable `settings/...` screen id. There are 27 ids today, and the user guide and in-app Help resolve them.
- Data that already exists for summaries:
  - `GET /api/v1/mfa` status: `enrolled` and `recoveryCodesRemaining`, plus trusted devices with `lastUsedAt` and `expiresAt`.
  - `GET /api/v1/passkeys`: `createdAt`, `lastUsedAt` and a suspicious flag.
  - Tokens and app passwords: created, last used and revoked times.
  - `GET /api/v1/me/activity` (90 days), push subscription state (local and server), and backup runs from the backups API.
  - Local sync status (`useSyncStatus`).
- Missing data: there is no list of sessions and no "password changed at" timestamp. The proposal keeps both out of scope, and the design must not imply them.
- One server touch point: `internal/httpapi/oidc.go` hard-codes `/settings/account` as the landing page of the link flow (callback, two error paths, success).
- `ui-primitives` delivers `SettingsSection`, `SettingRow`, `Card`, `Switch`, `Badge`, `Avatar`, `EmptyState`, `MenuItem`/`MenuGroup`, `Button` and `Icon`. It also delivers `ConfirmDialog` and `ListRow`, which this change uses heavily (see D5).

## Goals / Non-Goals

**Goals:**
- One section table that drives grouping, order, icons, role visibility, demo notes and legacy aliases, so the IA stays testable in one place.
- Rebuild each panel's view on the shared grammar without touching its container's data flow, API calls or storage.
- No regressions in role visibility, demo behaviour, Help screen ids, keyboard reachability or offline states.

**Non-Goals:**
- No new endpoints and no changes to response shapes.
- No change to what any control does, including per-device versus server storage.
- No redesign of the import screen or of dialogs that other features own (for example the share dialog).

## Decisions

### D1. Fourteen sections in four groups, driven by one table

`SettingsSection` gains `group: 'you' | 'app' | 'data' | 'server'` and `icon: IconName`. `SETTINGS_SECTION_IDS` gains `security`, `encryption`, `activity`, `preferences`, `projects`, `backups` and `access`. Group order and labels live next to the table (`SETTINGS_GROUPS`).

| Group | Section (id) | Panels (screen ids kept) |
|---|---|---|
| You | Account (`account`) | profile card, Session/Sign out (`settings/session`) |
| | Security (`security`) | Password (`settings/password`), Two-factor (`settings/two-factor`, member part), Passkeys (`settings/security`), Linked accounts (`settings/linked-accounts`) |
| | Encryption (`encryption`) | End-to-end encryption (`settings/encryption`) |
| | Activity (`activity`) | Recent activity (`settings/sessions`), Audit log (owner) |
| App | Preferences (`preferences`) | Start view, Calendar, Keyboard, Date and time (when `date-time-preferences` lands) |
| | Notifications (`notifications`) | unchanged panel |
| | Capture (`capture`) | Quick add, Voice, Bookmarklet and extension (`settings/capture`), Email to task |
| | Projects (`projects`) | Auto-archive and Archived projects (`settings/projects`) |
| Data and connections | Data (`data`) | Your data: export, import, sync status |
| | Integrations (`integrations`) | CalDAV, Webhooks, API tokens |
| | AI (`ai`) | Assistant, AI assistants |
| Server | Administration (`admin`) | config warnings, Users, Members |
| | Backups (`backups`, owner) | Backups |
| | Access policies (`access`, owner) | Two-factor policy (owner part of `TwoFactorPanel`), Single sign-on, Project invite links |

Rationale:
- **Security vs Activity:** credentials are things you change, while activity is something you review. Activity also needs width for its table.
- **Encryption alone:** it carries its own recovery-key flow and long explanations.
- **Quick add and voice under Capture:** they are about getting tasks in, which leaves Preferences for how the app behaves.
- **Backups and the owner policies under Server:** they configure the server, not the user's data, and `backup-restore-web` will grow the Backups section further.
- **Two-factor policy to Access policies:** today `TwoFactorPanel` mixes "my second factor" with "the server's policy". The container is split into `TwoFactorPanel` (personal) and `MfaPolicyPanel` (owner), and the policy keeps the `settings/two-factor` screen id because it is the same guide section.

Alternatives considered:
- **Keep eight sections and only restyle.** Rejected: user feedback explicitly asks to split, and Account at eight cards stays long even when well styled.
- **Tabs inside a section** (Account → tabs for Security, Activity, …). Rejected: a second navigation level hides content from the overview, makes deep links two-dimensional, and is worse for keyboard and screen-reader users than flat sections with groups.
- **More than four groups, or no groups.** Fourteen flat entries are hard to scan, and four groups map to how users think: me, the app, my data, the server.

### D2. Legacy aliases in the router, not redirects on the server

`parseRoute` maps `general` to `preferences` through a `LEGACY_SETTINGS_IDS` table. `SettingsView` calls `history.replaceState` when the parsed id differs from the URL, so back skips the old address. Kept ids need no alias. `account` keeps working, but its meaning narrows to profile and session.

The server keeps serving the SPA for every `/settings/*` path, as today. Only `oidc.go` changes its landing page to `/settings/security`; `SsoPanel` reads `?linked`, `?reauthenticated` and `?error` there.

Alternative: a server-side 301. Rejected because sections are client routes that must work offline from the service worker, and a server redirect does nothing offline.

### D3. Panel grammar: containers untouched, views rebuilt

Each `*View` renders `SettingsSection` (heading via `HelpHeading`, so screen ids and Help links stay) containing:
1. a **summary block** (state badge plus one line), where the panel has state;
2. **`SettingRow`s** for simple settings (switch, select, short input);
3. **lists** (D5);
4. **actions**, with any destructive ones last.

Concrete mapping:

- **Password:** a row "Password" with "Change password", which opens an inline expansion holding today's form. There is no "last changed" text (no data).
- **Two-factor:**
  - The summary shows a badge, On (emerald soft) or Off (slate), plus "7 of 10 recovery codes left". At 3 or fewer the badge turns to warning and "New recovery codes" is promoted.
  - Enrolment opens in a `Dialog`, as a 3-step flow with today's steps (QR code, confirm the code, save the recovery codes).
  - Remembered browsers become a list.
  - Disable sits in the danger area.
- **Passkeys:** the summary reads "2 passkeys", then a list with created and last-used times and a suspicious badge; "Add passkey" is the primary action. Empty state: what passkeys are, plus "Add passkey".
- **Linked accounts:** a list of identities, then "Link <provider>"; an empty state when nothing is linked.
- **Encryption:** the summary shows the state badge (Off / On / Locked on this device), plus actions by state. Reset sits in the danger area.
- **Activity:**
  - Recent activity becomes list rows: an icon per event kind (sign-in, failed sign-in, token), a label, a relative time, and agent and IP as secondary text. Failures get a danger tint.
  - The owner's Audit log keeps its filters and table inside its own card.
- **Account:**
  - The profile card shows `Avatar` initials, name, email and a role `Badge`. It reuses the overview's profile card component.
  - The Session card holds "Sign out of this device" (danger, confirm).
- **Preferences:**
  - Start view: a row with a select.
  - Calendar: rows for start hour, end hour and day length.
  - Keyboard: a row with a Vim `Switch`.
- **Capture:**
  - Quick add languages and Voice become rows.
  - The bookmarklet gets a card with the drag link plus an extension link.
  - Email to task: the summary shows the address and status, with a copy action.
- **Projects:** an auto-archive row (switch, plus a delay when on) and the archived-projects list, with an empty state.
- **Notifications:** the summary reads "On / Off on this device", with permission state as a badge; the subscription status line becomes part of the summary. `push-test-delivery` owns the behaviour of the test action, and this change only places it.
- **Data:**
  - "Your data": rows for Export (download) and Import (link), then a sync summary ("Synced" / "3 changes waiting").
- **Integrations:**
  - CalDAV: the summary shows the endpoint state and URL with a copy action; app passwords become a list.
  - Webhooks: a list with the last delivery outcome badge.
  - Tokens: a list with a scope badge (`full` / `read` / `agent`).
  - Each "New …" form opens in a `Dialog`. The one-time secret appears in the same dialog's success step with a copy action, so "shown once" stays obvious.
- **AI:**
  - Assistant (owner configuration form behind "Configure", or a member summary).
  - AI assistants: endpoint switch rows, the writes switch, and the token action.
- **Administration:**
  - Users becomes a list with role and status badges and a per-row menu.
  - Members and invitations: a list, with "New invitation" in a dialog.
- **Backups:** the summary shows the last run's time and outcome badge, then the next scheduled run; destinations and the schedule become rows; recent runs become a list.
- **Access policies:**
  - Two-factor policy: a select row.
  - Project invite links: a switch row.
  - Single sign-on: the summary shows provider and status; configuration opens behind "Configure" (inline expansion, since it is long and has env-locked fields).

### D4. Overview and navigation

- The overview is: profile card, Help link, config warnings (owner, unchanged), then one `<section aria-labelledby>` per group with an `h2` group heading and a `ul` of entries (icon, label, description, chevron). Entries stay links of at least 44 px.
- The side navigation (≥1024 px) uses the same groups: small uppercase group headings, entries with a 16 px icon, the current entry in emerald soft tint with `aria-current="page"`. The width grows from 12 rem to 15 rem to fit the icons.
- On phones the section page keeps the back link. The overview is the phone navigation, so there is no hamburger inside Settings.
- Section descriptions are rewritten to name the cards they hold, and stay role-aware (`description(user)`).

### D5. Uses of `ConfirmDialog` and `ListRow` (from `ui-primitives`)

Both patterns are defined once in `ui-primitives` (design-system requirements "Confirmation dialog" and "List row") so Settings, `labels-and-menus` and `task-detail-redesign` share one implementation.

- **`ConfirmDialog`** replaces every settings use of `window.confirm`: recovery codes, passkey removal, token and app-password revoke, webhook delete, user delete, invitation revoke, encryption reset, sign out.
- **`ListRow`** renders every settings list (passkeys, linked accounts, activity, archived projects, tokens, app passwords, webhooks, users, invitations, backup runs), preserving existing key handlers such as `UsersView.onRowKey`.
- Alternative: build them here as Settings is the first heavy user. Rejected, because two sibling changes need them too and order of landing would decide ownership.

### D6. Testing and verification

- `settingsSections.test.tsx` and `demo.test.tsx` cover these:
  - group order and membership per role (member, admin, owner);
  - the legacy alias;
  - every former screen id still rendered somewhere;
  - demo notes per section, and demo-only sections showing only the note.
- Each rebuilt `*View` gets stories (default, empty, offline, error, many items, and a warning state where one exists) in light and dark at 375 and 1280 px. They feed the axe and visual-regression gates defined by `design-language`.
- `scripts/e2e-layout.mjs` iterates the new section ids, with no horizontal overflow at 320 px. `scripts/docs-screenshots.mjs` paths are updated (`settings-security` → `/settings/security`, `settings-general` → `/settings/preferences`, …).
- Go: `oidc.go` tests assert the `/settings/security` landing page.

## Risks / Trade-offs

- [Muscle memory and docs drift: about 50 "Settings → General/Account/…" mentions in `docs/` and UI copy] → Update them in one task with a grep checklist, regenerate `help.json`, and rely on `make docs-check` to catch broken anchors.
- [Fourteen sections feel like more clicks] → Grouped overview and side navigation, short sections that open straight to their content, and Help screen ids that still deep-link.
- [Rebuilding twenty-odd views risks behaviour regressions] → Containers and their tests stay unchanged and only views change. Existing view tests are updated for markup, not logic. Migrate one section per task, keeping `make check` green after each.
- [Moving the owner's two-factor policy out of the Two-factor panel surprises owners] → The Two-factor card shows the owner a one-line link "Server policy: required for everyone → Access policies".
- [Backups leave Data] → For the owner, the Data section shows a row "Backups" that links to `/settings/backups`, so the old path still finds it.
- [Old bookmarks to the account section expecting Security] → `/settings/account` keeps working, and the Account section shows a short "Password, two-factor and passkeys are in Security" row with a link.
- [Dependency on unfinished primitives] → Tasks start with a check that `ui-primitives` is applied. Without it, this change does not start.

## Migration Plan

- This is client-only apart from the `oidc.go` landing page, so there's nothing to migrate in data or config.
- Deploy is a normal release. Rollback is a normal downgrade: old clients and the server ignore the new route ids, and old ids were never removed.
- After deploy, cached PWAs pick up the new routes on their next update. An older cached client opening `/settings/security` shows its overview (unknown section), which is acceptable.

## Open Questions

- Exact wording of section descriptions and empty-state copy can be finalised during implementation against the stories, without affecting the specs.
