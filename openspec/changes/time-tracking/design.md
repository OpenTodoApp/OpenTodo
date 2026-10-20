# Design

## Context

See proposal.md for motivation. The current state that shapes the approach:

- **Entities are rows in the op log, not tables.** `internal/sync/ops.go` `Schema` lists every entity and field; materialized values live in `scope_fields`, so a new entity needs no migration (the `comments` migration `0015` added only a partial index on `task_id`, which already serves every entity's `task_id`). `Validate` checks each op's kind (`kinds.go`: `kID`, `kNumber`, `kNullableNumber`, `kString`, `kInstant`). The scope resolver (`scope.go` `resolve`) places a `comment` and an `attachment` in their task's scope with per-op authorship checks (`comments.go`, `attachments.go`); everything else without a project is personal.
- **The REST side has two patterns.** Generic collections through `opsync.Plural` (`collections.go`) and dedicated handlers for entities with authorship rules (`comments.go`: `fieldOps(...)` → `ApplyStrict` → `NotifyApplied(res, serverDevice)`). Every route goes through `routes.handle(pattern, policy, handler)`; `middleware.go` refuses read and agent tokens on any write request before the handler.
- **The web data layer.** `web/src/lib/types.ts` (`Entity` union, `ENTITIES` order), `ops.ts` (`DEFAULTS` per entity, `mutate`/`mutateMany` writing a batch with one HLC timestamp), `db.ts` (one Dexie table per entity, version 19 today), `sync.ts` (`reseedAfterRestore` re-sends own comments and attachments only), `e2ee.ts` (`CONTENT_FIELDS`). Statistics are pure functions in `web/src/lib/stats.ts` (`compute`, `periodFor`, `dayInZone`) rendered by `web/src/app/review/StatsView.tsx` with `Bars`.
- **Shortcuts.** `web/src/lib/shortcuts.ts` is the registry; `VIEW_SCOPES.triage` is `[]`, so `triage.someday` (`y`, a `view` entry for the triage route) never meets a `list` entry. `list.estimate` (`e`) and `panel.priority` (overriding `list.priority`) are the models for a list key and its panel twin. Vim mode binds `x`, `o`, `i`, `d d`, `g g`, counts; not `y`.
- **The parsers are twins pinned by vectors.** `internal/quickadd` ↔ `web/src/lib/nlp` share `web/src/lib/nlp/quickadd.vectors.json` (37 cases) and `vocab.json`; `matchDuration` exists on both sides. `internal/filter` validates saved views and `web/src/lib/filter` evaluates; both tests parse the worked examples of `docs/filters.md`, which is the shared vector file. `Result`/`ParseResult` carry `estimateMinutes`.
- **Shell chrome.** From 768 px there is no top bar: status items live in the sidebar footer (`Sidebar.tsx` `SidebarFooter`: Help, notifications, assistant, shortcuts, `SyncStatus`, collapse, the account). Below 768 px `Shell.tsx` `PhoneBar` shows the menu button, the title and the page actions from the page-bar store.
- **The task panel** (`web/src/app/task-detail/`) has property chips and `ConversationTabs.tsx` with Comments, Activity and History; `task-panel-facets` (in flight) replaces the chips with facet lines and leaves the tabs alone.
- **Agent tools.** `internal/agenttools/read.go` defines the five read tools with `readDef`; `skills.go` lists `readTools`; `data.go` `taskOut` is the task payload shared by MCP and the assistant. The MCP spec pins "exactly the five read tools" today.
- **CLI.** `internal/cli/commands.go` `cmdSpecs` declares every command with flags and an output schema under `internal/cli/schema/`; `ot schema` prints it.
- **Trash.** `internal/sync/trash.go` purges reminders and comments of a purged task through the `task_id` reference and counts them in `PurgeCounts`.

## Goals / Non-Goals

**Goals:**
- One additive entity, no table, no migration, no new kind; every write through `mutate()` or `ApplyStrict`.
- A running-entry rule that every replica applies identically, so concurrent starts converge with no server arbitration.
- Totals that are pure functions of the rows, computed on the device, with the server's CSV and MCP figures matching them for synced data.
- Grammar changes (filter, quick add) pinned by the shared vectors on both sides.

**Non-Goals:**
- No timer UI beyond start/stop and elapsed time (`focus-mode`); no idle detection; no rounding or billing.
- No activity or webhook events for entries (both have closed catalogues; `time_entry.*` events would be a later additive change).
- No per-project time report for admins; no `estimate cmp duration` filter term (the duration value grammar makes it a follow-up).

## Decisions

### D1. `time_entry` is an entity in its task's scope with comment-style authorship

`Schema["time_entry"]`: `task_id` kID, `user_id` kID, `started_at` kInstant, `ended_at` kInstant (nullable through `orNull`), `device_id` kString, `note` kString, `created_at` kNumber, `deleted_at` kNullableNumber. `ValidEntityID` applies as everywhere. A new `internal/sync/timeentries.go` mirrors `comments.go`: `noteTimeEntry` collects `task_id`/`user_id` of entries created in the batch, `resolveTimeEntry` places the entry in its task's scope, requires `user_id` equal to the submitter at creation, keeps `task_id`/`user_id` immutable, accepts `started_at`, `ended_at`, `note`, `device_id` from the author only, `deleted_at` from the author, a project admin or the owner, and refuses creation by a viewer (role table, unlike comments). Ops for an entry whose task was purged are discarded like comments'.

- **Alternative: personal scope like reminders.** Rejected. A shared task's tracked total would differ per member and a project could never answer "what did this cost us"; the brief's `user_id` already implies entries from several people on one task.
- **Alternative: a `tracked_minutes` field on the task.** Rejected. Two devices tracking the same task would overwrite each other under LWW; separate rows add.
- **Alternative: viewers may track like they may comment.** Rejected. Commenting is the one documented viewer write; tracking is work on the task and belongs to editors.

**Data model impact:** one additive entity; no field of any existing entity changes; `Plural` is not extended (dedicated routes, D7). Not **BREAKING**. `e2ee.ContentFields["time_entry"] = {"note"}` and `CONTENT_FIELDS.time_entry = ['note']`; the server never sees a plaintext note of an encrypted personal task and `e2ee.Display` degrades it to "[encrypted]" in the CSV and the MCP tool.

### D2. The running rule is a pure function both sides run

`internal/timetrack` (new, no dependencies) and `web/src/lib/time.ts` implement:

```
running(entries, userId): TimeEntry | null                  // the one to keep: greatest started_at, then greatest id
repairs(entries, userId): [{id, ended_at}]                   // every other running entry of the user ends at the kept one's started_at
startBatch(task, userId, deviceId, now, entries): Change[]  // new entry + ended_at on the current running one (+ repairs)
minutesOf(entry, now): number                                // max(0, (ended_at ?? now) − started_at) in whole minutes
```

The client runs `repairs` whenever the rows change (a Dexie live query on `timeEntries.where('ended_at').equals(null)` filtered by `user_id`): if two or more running entries of the user are present it writes the repairs through `mutate()`. Both devices compute the same `ended_at` for the same loser, so the two repair ops carry the same value and LWW picks either without a visible difference. The server applies the same function inside `POST /api/v1/time-entries` and `/stop` (reading the user's running entries through the reader pool, writing one `ApplyStrict` batch) but never repairs on the sync path: the server stays a passive log for devices, as for `review` and `user_prefs`.

A device also writes `ended_at = now` on the running entry in the same `mutateMany` batch as `completed_at` when the user completes that task (`completeTask` in `ops.ts`); the server's completion paths (REST, CalDAV, agent tools) do not, because they do not know whether the person is still working, and the next start or stop on a device closes it.

- **Alternative: the earlier start wins.** Rejected. The later start is the person's latest intention; it is also what the "start stops the running one" rule produces when the devices are online.
- **Alternative: the server ends the loser at receipt.** Rejected. It would make the server write ops for a device's entity on the sync path, which no entity does today, and offline devices would still need the client rule to show a coherent state before they sync.

### D3. Entries belong to the local day they started on

Every per-day figure (Today's tracked total, Statistics per day, the filter `tracked` evaluation of "today" is not needed) uses `dayInZone(zone)(started_at)` with the device's zone (the `tz` parameter on the server, UTC otherwise). An entry across midnight is counted whole on its start day. `stats.ts` `compute` gains `trackedMinutes`, `trackedPerDay` and `trackedPerProject` from an optional `entries` input (own entries only: `user_id === me`, live, on live tasks that are not in the Trash), so `StatsInput` stays backwards compatible and the Loop pulse is untouched.

- **Alternative: split entries at midnight.** Rejected. More code for a rare case and a figure that disagrees with the entry list, where an entry is one line.

### D4. Totals on rows and in Today are derived live, not stored

`TaskListView.tsx` already live-queries the tasks; it adds a live query of `timeEntries` (all members', live, `ended_at` or running) grouped by `task_id` into a `Map<string, number>` passed to `TaskRow` as `trackedMinutes`, recomputed once a minute while any entry of the list runs (one interval, not one per row). `TaskRow.tsx` renders the existing estimate `NeutralChip` as `${formatMinutes(tracked)} / ${formatMinutes(estimate)}`, `${tracked} tracked` without an estimate, with an `aria-label` from the catalog. Today's `PageHeader` gets `meta` = "3h planned · 1h 20m tracked" (planned: sum of `estimate_minutes` of the listed open tasks; tracked: the user's own entries started today), omitted when both are zero.

The filter evaluator receives the same map through `EvalContext` (`tracked?: ReadonlyMap<string, number>`) so `tracked > 1h` is a lookup; `FilterView` and saved views build it from the same live query. A running entry makes the matching re-run on the minute tick.

### D5. The Time tab, start/stop and the `y` shortcut

- `ConversationTabs.tsx` gains a fourth tab, Time, labelled "Time · 35m" when a total exists, remembered per device like the others. `task-detail/TimeTab.tsx` lists entries newest first (`ListRow` pattern: day, `09:00–09:25`, duration, note, the author's `Avatar` in a shared project), a Start/Stop `Button`, an "Add time" form (`Field` for `45m` / `1h30` / `90`, a day picker defaulting to today, or Start and End times) and Edit/Delete in each own entry's `Menu`. Validation of end ≥ start happens in the form (per-field LWW cannot enforce it at receipt; `minutesOf` clamps at zero for the rare inverted entry that two concurrent edits could produce).
- `ActionMenu.tsx` (row menu) and the panel header menu gain "Start tracking" / "Stop tracking" with the `y` hint; hidden for completed and deleted tasks and for viewers.
- Registry entries: `{ id: 'list.track', keys: ['y'], description: 'Start or stop tracking time on the selected task', section: 'tasks', scope: 'list' }` and `{ id: 'panel.track', keys: ['y'], scope: 'panel', hidden: true, overrides: ['list.track'] }`. The conflict test passes: `triage.someday` is a `view` entry on a route without `list`. `docs/keyboard.md` and the cheat sheet follow from the registry.
- When `task-panel-facets` ships, the tracked figure becomes a part of its How line (the facet builder reads the same map); the Time tab stays where manual entries live. Neither change blocks the other.

### D6. The running indicator lives where status lives

`web/src/app/TrackingIndicator.tsx`, rendered by `SidebarFooter` above the icon row from 768 px (a `SidebarItem` with the `timer` icon, `1:05 · Write the report` in tabular figures, a Stop `IconButton`; collapsed sidebar shows the time only with the title in the tooltip) and by `PhoneBar` as a pill beside the title that opens a bottom sheet (`Dialog` in sheet mode) with the title, Open and Stop. One live query on the user's running entry, one `setInterval` aligned to the minute, `aria-live="polite"` announcements only on start and stop (the ticking text is `aria-hidden`, the accessible name is static "Tracking Write the report, 1 hour 5 minutes" refreshed on focus). `timer` is added to the vendored icon set (`web/src/ui/icons/lucide.ts`, `names.json`).

- **Alternative: a page-header slot.** Rejected. The indicator must survive navigation; the header is per view and the budget allows no extra row.
- **Alternative: the document title.** Not now; it changes the tab title every minute in every window and is cheap to add later.

### D7. Dedicated REST routes, one handler file

`internal/httpapi/timeentries.go` registers, through `routes.handle`:

| Route | Policy |
| --- | --- |
| `GET /api/v1/time-entries` (`task`, `from`, `to`, `tz`, `running`, `format=csv`, `limit`, `cursor`) | `signedIn` |
| `GET /api/v1/tasks/{id}/time-entries` | `signedIn` |
| `POST /api/v1/time-entries` | `signedIn` |
| `POST /api/v1/time-entries/stop` | `signedIn` |
| `PATCH /api/v1/time-entries/{id}` | `signedIn` |
| `DELETE /api/v1/time-entries/{id}` | `signedIn` |

Writes are `fieldOps("time_entry", ...)` → `ApplyStrict` → `NotifyApplied(res, serverDevice)`; a start adds the `ended_at` op for the running entry to the same batch (D2); `deviceId` is `server`. The middleware refuses `read` and `agent` tokens on the POST/PATCH/DELETE before the handler, so no new scope code. Not `.demoDenied()`: nothing outbound, nothing stored outside the sandbox's log, and the nightly reset clears it; `demo.go` is unchanged and `TestDemoDenyListMatchesPolicy` still agrees. Error codes come from the existing fixture (`unauthorized`, `insufficient_scope`, `forbidden`, `not_found`, `invalid_input`); "nothing to stop" is `not_found` with a message, so `web/src/lib/i18n/errors.ts` needs no new code. JSON field names are camelCase as in the comment routes (`taskId`, `startedAt`, `endedAt`, `minutes`, `note`, `deviceId`).

- **Alternative: add `time-entries` to `Plural` for the generic collection.** Rejected. The generic handlers know nothing of "start stops the running one", of the author rule, or of the CSV; comments took the same route for the same reason.

### D8. The CSV is one definition on both sides

`internal/timetrack/csv.go` and `web/src/lib/time.ts` `toCSV` write `date,start,end,minutes,task,project,labels,note,<custom field name>…`: dates `YYYY-MM-DD`, times `HH:MM` in the caller's zone, labels joined with `;`, custom field columns in the project's field order, one column set for the whole file (the union of the fields of every project present, empty where a task's project lacks one), RFC 4180 quoting, a UTF-8 BOM so spreadsheets open it as UTF-8. The shared fixture `internal/timetrack/testdata/csv_fixture.json` (entries, tasks, projects, labels, fields, zone, expected text) is run by `csv_test.go` and `web/src/lib/time.test.ts`. The server's CSV shows "[encrypted]" for ciphertext titles, names and notes (`e2ee.Display`); the device's export has the plaintext. Statistics triggers the device export (`Blob` download, offline), `ot time export` and `format=csv` the server's.

### D9. Filter grammar: `tracked` keyword and a duration value

Both parsers add `tracked` to the simple keywords and a `tracked cmp duration` term where `duration` is `matchDuration`'s grammar without the `+` and without the French clock ambiguity (a filter query is not a sentence): `30m`, `45min`, `1h`, `1h30`, `1.5h`, bare minutes. `tracked` joins the reserved words (`parse.ts` and `filter.go`, the docs' grammar block). The evaluator compares against the map from D4; on the server `internal/filter` only validates (`views.go`). `docs/filters.md` gets a "Tracked time" row in the terms table and three worked examples, which both tests parse, so the vector set grows with the docs.

### D10. Quick add: `<spent>/<estimate>` with units on both sides

`attributes.ts` / `attributes.go` add `matchSpent(token)`: `^(<dur>)/(<dur>)$` where each `<dur>` is `\d+(?:[.,]\d+)?h(?:\d{1,2}(?:m|min)?)?` or `\d+(?:m|min|mins|minutes)`, no bare numbers (so `30/12` stays a date in day-month languages) and no `+`. `ParseResult.spentMinutes: number | null` / `Result.SpentMinutes int`; the preview shows a "Spent 30 min" chip (`QuickAdd.tsx` chips, dismissable like the others). `createTask` in `ops.ts` appends a closed `time_entry` (`started_at = now − spent`, `ended_at = now`, `device_id` = this device, `user_id` = me) to the same `mutateMany` batch; `ot add --natural` plans a `POST /api/v1/time-entries` after the task (`--dry-run` shows both); the importer ignores `SpentMinutes` (template lines carry no past work). Six new cases in `quickadd.vectors.json` (en, de, fr, es, it, pt), including `Réunion 15h` staying a clock time and `Pay rent 30/12` staying a date. `vocab.json` is unchanged: units are not translated.

### D11. Export, import, purge, MCP, CLI

- `export.go` adds `out["time_entries"] = s.sync.List(ctx, uid, "time_entry", true)`; `plan_own.go` recreates entries with their ids, rewrites `user_id` to the importing account for its own and drops others with a counted warning (the assignee pattern); the preview's totals gain `timeEntries`. Backups and restore need nothing: the snapshot holds the log, and `reseedAfterRestore` re-sends the device user's own entries only (`user_id === me`, next to the comment and attachment checks).
- `trash.go`: the purge cascade purges `time_entry` rows referencing a purged task through the existing `task_id` index, with markers, and `PurgeCounts.TimeEntries` (additive JSON `timeEntries`).
- `agenttools/read.go`: `list_time_entries` (`readDef`, arguments `task_id`, `from`, `to`, `timezone`, `running`, `limit`, `cursor`), added to `readTools`; `taskOut` gains `tracked_minutes`. The MCP `tools/list` test moves from five to six read tools; `opentodo://tasks/{id}` carries `tracked_minutes` through `taskOut`. No write tool and no agent REST route, so agent tokens cannot track.
- `internal/cli/cmd_time.go`: `time start`, `time stop`, `time log`, `time list`, `time export` in `cmdSpecs` with `schema/time_entry.json`; `--on` without times places a duration-only entry ending at 17:00 local (documented; the web form defaults to "ending now" instead because the user is present). The skill file (`SKILL.md`) gains the five commands.

## Size and resources

No dependency on either side. Web main chunk about +10 KB gzipped: `time.ts` (rule, totals, CSV) about 2.5 KB, `TimeTab.tsx` and the add form about 3.5 KB, the indicator about 1.5 KB, Statistics, filter and quick-add additions about 2.5 KB; each language catalog about +1.5 KB gzipped (roughly 40 strings). Dexie gains the `timeEntries` table (version 20) with indexes `task_id`, `user_id`, `ended_at`. Binary about +0.3 MB uncompressed (`internal/timetrack`, the handler file, the CLI command, the MCP tool and their tests are not shipped); the distroless image stays at about 25 MB. Runtime memory unchanged: entries are rows in `scope_fields` like every entity, and the per-list total map holds one integer per task shown. The minute tick runs only while an entry of the current list or the indicator is running.

## Interface budget

- Rows of chrome above a list's first item: unchanged (the Today totals are the header's `meta`, inside the header block; no second row).
- Task properties visible by default: unchanged; tracked time joins the estimate chip (one chip, `task-list-presentation` delta), and the panel's Time tab is content below the properties, not a property.
- Primary sidebar destinations: unchanged; the indicator is a footer status item like the sync dot.
- Vertical scroll regions: unchanged (the Time tab scrolls with the panel; the phone sheet is an overlay).
- Shortcuts: `list.track` (`y`) and `panel.track` (`y`, overrides `list.track`) registered in `web/src/lib/shortcuts.ts`; the conflict test proves no clash with `triage.someday` (`view` scope on a route without `list`) or with Vim keys.

## Risks / Trade-offs

- [A forgotten running entry grows for hours or days] → the indicator is always visible while it runs; the Time tab lets the user edit the end; `minutesOf` is unbounded by design (no idle detection, out of scope) but the indicator switches to `h:mm` and shows a caution tone after 12 hours. `focus-mode` can add a reminder.
- [Two members' entries inflate "my" numbers] → rows and the Time tab show the task's total (what the task cost); Statistics and Today count the user's own entries only, stated on the screens, matching "Whose tasks count in shared projects".
- [Per-field LWW allows `ended_at < started_at` after concurrent edits of start and end] → `minutesOf` clamps at zero, the Time tab marks the entry, editing either field repairs it; the REST and form validations stop the common case.
- [The minute tick re-renders large lists] → one interval per list, only while an entry of that list runs; the tick updates the map and only rows whose total changed re-render (memoised `TaskRow`). `listPerformance.test.tsx` gets a case with a running entry.
- [The `y` key surprises people used to Vim's yank] → Vim mode never bound `y`; the cheat sheet, the row menu hint and `docs/keyboard.md` list it.
- [Quick add misreads `30m/2h` in a title about ratios] → both parts need a unit and the chip is dismissable with Backspace like every parsed token; the title keeps the text when dismissed.
- [Exporting thousands of entries from the device] → the CSV is built from a Dexie range query on `started_at` per period, streamed into one `Blob`; 10,000 entries are about 1 MB.
- [Imports of another person's export carry their `user_id`] → dropped with a counted warning, as foreign assignees are; nothing is ever written under another account.

## Migration Plan

Additive. Deploy the server first or the web app first: an older web app ignores `time_entry` ops in a pull (`applyOps` in `web/src/lib/ops.ts` skips ops whose entity is not in `ENTITIES`; a test pins it) and an older server refuses them as `unknown entity`, which the client keeps in its outbox until the server is upgraded, as for every schema addition. The Dexie upgrade to version 20 adds one empty table. Rollback is reverting the commit: entries already in the log stay harmless rows nobody reads. Docs: new `docs/time-tracking.md`, updates to `docs/sync.md` (schema table and a "Time entries" section), `docs/api.md`, `docs/cli.md`, `docs/mcp.md`, `docs/filters.md`, `docs/quick-add.md`, `docs/statistics.md`, `docs/e2ee.md`, `docs/keyboard.md`, `docs/import-export.md`.

## Open Questions

- Whether the indicator should also prefix the document title with the elapsed time (D6); a per-device preference can be added later without touching the specs or the task breakdown.
