# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Most of the method's parts already exist:**
  - Capture: quick add, email, share, voice and the CLI.
  - Inbox triage: `inbox-triage`, `/triage`, `g p`.
  - Start dates and Someday: `start-dates`, `start: date | 'someday'`, with Anytime and Someday views.
  - Blockers: `blocked_by` (`task-dependencies`), with blocked state derived on the device.
  - Assignment and delegation from triage.
  - Project notes: `notes_doc` (`project-notes`).
  - The four-step review: `web/src/lib/review.ts`, `web/src/app/review/ReviewView.tsx`, and the personal `review` row with `completed_at` (`internal/sync/ops.go:462-470`).
- **The personal preference entities already exist.**
  - `user_prefs` (id `me`) holds `theme_*`, `sidebar_destinations`, `density`, `first_run` and `language`, each a string read with a default when unknown.
  - `project_prefs` is keyed by project id and always resolves to the author's personal scope, even for a shared project (`ops.go`, `activity-feed` D1). Its own comment reserves it for "later per-project preferences".
  - Both tables are in Dexie already (`web/src/lib/db.ts:106`, `:487`), so new fields need no Dexie version.
- **The "no next action" rule exists twice:** `reviewSteps` in `web/src/lib/review.ts` and `WithoutNextAction` in `internal/digest/stats.go:229-250`. Both check only "no open live task". The digest's `Task` has no `start`, `blocked_by` or section, and its `Input` has no sections.
- **The sidebar's primary list is `['inbox', 'today', 'upcoming', <calendar>]` plus promotions** (`web/src/app/sidebar.test.tsx:81`). The live `app-shell` scenario's "five primary destinations" counts four destinations plus More; the delta states four.
- **Contextual help:** `HelpLink screen="…"` opens the guide section whose page lists that id in its `screens:` front matter, and the docs check fails on an unknown id. `PageHeader` has a `subtitle` node that is also forwarded to the phone bar.
- **Copy:** English source strings are message ids, and the six catalogs live in `web/src/locales/*.json`. `make i18n-check` fails on untranslated ids.
- **Site bundle:** `scripts/site-bundle.mjs` writes `manifest.json` (schema 1) with a `facts` object, and is plain Node that reads repository files.
- **Interface budget** (`docs/interface-guide.md`): 2 chrome rows above a list, 7 task properties, 6 primary sidebar destinations, 3 scroll regions, and registered shortcuts.

## Goals / Non-Goals

**Goals:**
- One definition of the vocabulary and one of each derived rule (next action, without next action, stalled, waiting), each used by every surface.
- Make the method's prominence a pure presentation switch: no mode ever writes or hides data.
- Keep `lists` users' screens unchanged except for the improved weekly review, which carries no method words.

**Non-Goals:**
- A method engine or plugin system for other methods (PARA, Eisenhower). The vocabulary module is specific to Open Loops.
- Server-side rendering of the Loop home or the views. Everything is computed on the device except the digest's one rule.

## Decisions

### D1. The vocabulary is one JSON file of ids and English text; translations live in the catalogs

`web/src/lib/method/vocabulary.json` holds the method name, moves, principles, Places, Rhythms and Horizons. Each entry has an `id`, an English `name` and `description`, and, for moves, the `route` and the shortcut id that serve it. `web/src/lib/method/index.ts` wraps every string in `msg()`, so the i18n extractor sees them and the six catalogs translate them like any other copy. `scripts/site-bundle.mjs` reads the same JSON and the six catalogs to write `method.json`. The bundle therefore can't drift from the app.

The method name is a single constant used in one place, so a rename before release changes one file plus the docs folder name.

*Alternatives:* vocabulary in Markdown front matter (the docs would own it, but the app would have to parse docs at runtime); per-language vocabulary files (they would duplicate the catalogs and bypass `i18n-check`).

### D2. "How you work" is `user_prefs.method_mode`, a string read as `lists` when unknown

This follows exactly the pattern of `density` and `sidebar_destinations`: an additive `kString` in `Schema["user_prefs"]`, the default in `web/src/lib/ops.ts`, the type in `types.ts`. The mode is read through one hook (`useMethodMode()`), which every surface consults. The start-view offer writes only the existing per-device `startView` key. The field is `method_mode`, not `method`, because `method` is already an audit detail key (the sign-in method) and the audit test forbids any overlap between entity fields and detail keys.

*Alternative:* a per-device setting. Rejected, because the sidebar and markers should follow the user, as appearance does, while the start view stays per device as it is today.

### D3. Derived rules live in `web/src/lib/method/rules.ts` with a Go port in `internal/digest`, pinned by shared vectors

`isActionable`, `nextActionOf(project)`, `withoutNextAction`, `isStalled` and `waitingOf` are pure functions over tasks, projects, sections, memberships, the user id and the local date.

- The digest needs only `withoutNextAction`, which does not depend on list order. `digest.Task` gains `Start` and `BlockedBy`, and `WithoutNextAction` is rewritten to the shared rule; sections stay web-only.
- A fixture `internal/digest/testdata/next_action_fixture.json` (a handful of projects and tasks plus expected outputs) is read by a Go test and by a vitest test. This is the same pattern as `internal/activity/testdata/activity_fixture.json`.
- "Blocked" uses the existing derived blocked state: blocked while any task in `blocked_by` is live and open.
- `stalled` and `waiting` stay web-only for now. The digest doesn't show them, so they need no port.
- The 21-day stalled threshold and the 90-day old-Someday threshold are constants in `rules.ts`, named in the docs.

*Alternatives:* computing "next" on the server for every client (contradicts local-first); a stored `is_next` flag on tasks (a second source of truth that would need convergence rules every time order changes).

### D4. The per-project review stamp is `project_prefs.reviewed_at`

`project_prefs` already resolves to the author's personal scope for shared projects. A stamp there is personal by construction: no new scope rule, no new entity, and LWW per field. The walk's queue is ordered by this value from the local `project_prefs` table. The stamp is written with `mutate()`, offline through the outbox.

*Alternative:* a field on `project`. Rejected because it would be shared with every member, and one member's review would mark the project reviewed for all of them.

### D5. Rhythm records are fields on the existing `review` row

The new fields are `daily_at`, `monthly_at`, `focus_date` (a `YYYY-MM-DD` string) and `focus` (comma-separated task ids, at most three), all additive on `Schema["review"]`. Per-field LWW means the phone's daily check and the laptop's weekly finish never overwrite each other. The focus is shown filtered by live, open and visible tasks, so a completed or trashed task drops out without a write. Task ids aren't content, so nothing is added to `e2ee.ContentFields`.

*Alternatives:* a `review_log` entity, so every finish is a record. It's deferred to `review-history`. The fields here are its seed, and a log can be added later without migrating them.

### D6. Review screen structure stays inside the budget

- The seven steps are one `Tabs` row (chrome row 2). The phase names are tab-group labels drawn as small separators, not a third row.
- On phones the tab row needs to scroll horizontally inside itself. `Tabs` has no overflow handling today, so it gains `overflow-x: auto` with the selected tab scrolled into view, as a primitive change with a story. That's not a new vertical scroller.
- The project walk is a card mode like triage. It owns the keyboard while its step is shown, through a `useShortcutScope('review-walk', …)` scope with keys registered in the shortcut table:
  - `r` reviewed, `q` quick add for this project, Enter open, `a` archive, `j`/Space skip, `k` back (`o` is Vim's open-below).
  - `q` is the global quick-add key scoped to the project, which avoids teaching a second "add" key.
- The Someday step reuses the list's `n` (park or bring back), so its "promote" is the existing operation.
- The Daily check's `f` (focus) is a new list-scope key, free in the registry today.
- Daily check and Monthly look are routes (`/review/daily`, `/review/monthly`) inside the lazily loaded review bundle, and reachable from the header's overflow menu. That's no new visible action: header actions stay "Finish review" plus the menu.

### D7. Sidebar by mode

`sidebarLayout.ts` gets the primary and More lists from the mode (the table in the `app-shell` delta). `first` mode uses a fixed six-item list, so the budget test's six-item limit holds. Promotions are not applied while in `first` mode, but the stored list is untouched. That's why switching back restores the user's sidebar. The new destinations `loop`, `next` and `waiting` are added to the promotable set; older clients ignore them per the existing rule.

### D8. Method links are a meta node, not a header action

A small `MethodLink` component renders "‹Move› · Open Loops" as a link-styled button that calls `openHelp('method/<move>', el)`. `useWithMethod(move, existing)` appends it to a header's `meta` (the text beside the title on desktop) and `subtitle` (the phone bar's second line), returning the existing value untouched in `lists` mode. This adds no header row and no action. Each `docs/method/<move>.md` page lists `method/<move>` in its `screens:` front matter, so the docs check guards the ids.

### D9. Loop home and views

- **Loop home** (`/loop`): a lazy view composed of `Card` tiles from `web/src/ui`, with counts from `rules.ts` and `review.ts` and today's focus as ordinary `TaskRow`s. That gives one scroller (content) and one chrome row (header).
- **Next and Waiting:** ordinary list views over derived rows, built on the existing grouped list rendering (group headers like Anytime's project groups). They get all list keys for free, including Vim.

Neither adds a task property. Next shows the project chip that cross-project lists already show, and Waiting shows the existing assignee and blocked chips.

### D10. First-run step 2 becomes "How do you want to work"

The appearance choice moves into the same step as a second row, so the card stays at three steps. Companion is preselected but not written until the user continues. Skipping writes nothing, so the preference reads `lists`. The starter labels are created through the existing label op path, after checking local labels by name, case-insensitively.

## Data model impact

All additive; no field is renamed or removed, and nothing is encrypted:

| Entity | New field | Kind | Content? |
| --- | --- | --- | --- |
| `user_prefs` | `method_mode` | string (`lists`/`companion`/`first`) | no |
| `project_prefs` | `reviewed_at` | number (Unix ms) | no |
| `review` | `daily_at`, `monthly_at` | number | no |
| `review` | `focus_date` | string `YYYY-MM-DD` | no |
| `review` | `focus` | string (task ids) | no |

Each field is added to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, and the defaults in `web/src/lib/ops.ts`. They're included in the JSON export through the existing entity export, and derive no activity event (they're not in `internal/activity`'s mapping). There's no new route, no Dexie version, and no change to `e2ee.ContentFields`.

## Size and memory

- No new dependency.
- Web: the vocabulary, rules, Loop home, Next/Waiting and walk add an estimated 10-15 KB gzipped. The Loop home, walk and rhythms are in the lazy review chunk. Catalog growth is about 150 strings per language, each in its own lazy locale chunk.
- Server: three extra fields in `digest.Task`, so runtime memory is unchanged in practice.
- Binary: grows only by the embedded docs (about 10 pages) and `method.json` in the site bundle. No container image change beyond that.

## Risks / Trade-offs

- **[Risk] The changed "without a next action" rule shifts what existing digests report.** A project with only blocked or assigned tasks disappears from that list. → Mitigation: the CHANGELOG and the review guide explain it, and Waiting shows those tasks.
- **[Risk] The method name isn't final, and it's translated nowhere but spread across docs paths.** → Mitigation: one constant (D1). Docs live under `docs/method/` and never repeat the name in file names.
- **[Risk] Seven review steps feel heavy for a quick review.** → Mitigation: three of them are always done and the screen opens on the first unfinished step. The Daily check exists for the light version.
- **[Risk] The trademark.** "GTD" appears only in "Coming from GTD" as a reference, with a non-affiliation sentence. Product copy never uses it.
- **[Trade-off] Contexts are a naming convention (`@`), not a field.** It's cheap and works with E2EE and every client today. The cost is that a user's existing `@something` labels become contexts automatically, which is usually what they meant.
- **[Trade-off] "Next" is sequential: one next action per project.** Parallel projects are a follow-up; until then, users who want every actionable task use Anytime.

## Migration Plan

- Existing accounts read `method_mode` as `lists`. Their sidebar, start view and pages are unchanged, and the weekly review shows the new steps without method words.
- Clients that predate this change ignore the new `user_prefs` and `review` fields and keep their values (existing rules for unknown fields on known entities).
- Servers that predate it reject the new fields as unknown. The device keeps its local value (existing "Older server" scenario).
- Rollback: the fields are inert to older code, and removing the UI leaves them as unused data.
- Build order: rules and fixture first, so the digest change ships with the app's.

## Open Questions

- The final method name. "Open Loops" is the working name (D1 keeps a rename cheap). The specs don't depend on it.
- The trigger prompt list for Mind sweep: final wording and count (8-12) are a copy decision for the docs pass.
