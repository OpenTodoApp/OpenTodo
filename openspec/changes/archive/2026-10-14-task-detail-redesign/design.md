# Design

## Context

`web/src/app/TaskDetail.tsx` (348 lines) renders one `<fieldset>` of stacked fields, each wrapped by a local `Field` (uppercase xs label over a control). Below it:

- `TaskConversation.tsx` holds the composer at the top and one newest-first `<ol>` that interleaves comment threads (`threadOrder`) with derived activity events (`taskActivity`, `mergeOlder`).
- `HistoryPanel.tsx` sits in its own footer block behind a `▸ History` toggle. It fetches `/history` pages (`lib/history.ts`, which already decrypts e2ee values) and renders one line per field change with "Restore this value".

The rest of the panel:

- **Project, Section and Parent** are native `<select>`s. Project uses `flattenTree` with space indentation; Parent lists every open task of the project minus descendants.
- **`DueField.tsx`** has split native date and time inputs plus a "Fixed to time zone" checkbox, with `z` bound globally. It uses `fixDueToZone`, `releaseDue`, `dueFromView` and `zoneHint` from `lib/dates.ts`.
- **`AssigneePicker`** offers "Unassigned" plus `assigneeOptions()`, which returns only the viewer for scopes without a membership.

This change lands after three siblings it builds on:
- **`ui-primitives`** provides `web/src/ui/` (Combobox via `useCombobox`, Tabs, Avatar, Badge, MenuItem/Menu `kind="menu"`, Timeline, EmptyState, Field, Switch, Icon) and `lib/pickRank.ts` (the device-local `pickHistory`), and rebuilds AssigneePicker and LabelPicker on Combobox.
- **`date-time-preferences`** provides the formatting API in `lib/dates.ts` and the date and time fields used by due and reminders.
- **`labels-and-menus`** owns the project "Move to" picker.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- A panel that reads like a document: values first, editors on demand, fully keyboard operable, no regressions to any shortcut (`z`, `Shift+C`, `c`, `1`–`4`, Escape).
- Presentation logic (ranking sources, grouping, summaries) in pure `lib/` helpers with unit tests; components stay thin.
- Zero data-model change.

**Non-Goals:**
- Changing what the history and activity routes return, or deriving activity differently (`internal/activity` and `web/src/lib/activity.ts` must keep matching the shared fixture).
- Virtualising the comment list (threads are bounded per task; activity already pages).
- Rich-text comments.

## Decisions

### D1. Properties rows: read mode by default, editor on demand
Each field becomes a `PropertyRow` (local to `app/task-detail/`, built from the `ui-primitives` `Field` and design tokens): an icon, a label column (fixed width at ≥ 640 px, above the value on phones) and a value button. Activating the value (click, Enter or Space) swaps in the editor: a picker, the date-time-preferences fields, the priority segmented control, or the existing Recurrence and Estimate editors restyled. Escape or a committed edit returns focus to the value button. Priority stays a one-click segmented control because it has four values (the shortcuts `1`–`4` remain).

- *Alternative:* always-visible inputs, restyled. Rejected: it keeps the "form" feel the user dislikes, and doubles the tab stops.
- *Alternative:* a separate edit mode for the whole panel. Rejected: extra mode, and it breaks the "edit applies at once" behaviour of the Edit task fields requirement.

The panel splits into `app/task-detail/` modules: `TaskDetail.tsx` (shell, header, properties), `Properties.tsx`, `ZoneControl.tsx`, `ConversationTabs.tsx`, `CommentsTab.tsx`, `ActivityTab.tsx`, `HistoryTab.tsx`. `app/TaskDetail.tsx` re-exports for existing imports. The viewer read-only mode renders values without editors instead of a disabled fieldset, so text stays readable and contrast-compliant.

### D2. Entity picker sources over the shared Combobox
`lib/pickerSources.ts` exports pure builders (`projectSource`, `parentSource`, `sectionSource`) that take local rows and return Combobox items `{ key, label, path, group, meta }` in natural order, applying the exclusion rules from the `entity-pickers` spec:
- archived or deleted projects are listed only as the current value;
- the task itself and its descendants (via `descendants()`) are excluded from parents;
- completed or deleted current values are marked.

Ranking is not re-implemented. Each call site passes a `rankContext` (`task.project`, `task.parent`, `task.section`, `project.parent`, `capture.project`, `import.target`) to `pickRank` so recents are tracked per context. The Project picker's create row calls the existing project-creation op path and then `moveTo(newId)`, so the move-copies-across-scopes behaviour (`updateTask` returning a new id) is preserved. The Sidebar, ShareCapture and ImportScreen call sites swap their `<select>` for `<Combobox>` with the same source builders.

- *Alternative:* fold these sources into `ui-primitives`. Rejected: `ui/` must not read `src/lib` data (ui-primitives D1), and the exclusion rules are domain logic.

### D3. Assignee in personal scopes is display-only
`isSoloScope(projectId, memberships, me)` (in `lib/sharing.ts`) is true when `assignableIn()` is exactly `{me}`. In a solo scope the Assignee row shows Avatar + "You" and a `Switch` labelled "Show in Assigned to me" bound to `task.assignee_id === me`; toggling writes `updateTask({ assignee_id: me | null })`.

Options considered:

| Option | Assigned to me | Op log | On sharing | Verdict |
|---|---|---|---|---|
| A. Display "You", no op (chosen) | unchanged meaning (explicit only) | no writes | unassigned tasks honestly read "Unassigned" | ✔ |
| B. Write `assignee_id = me` when creating in a solo scope | floods with every personal task, so the view loses its purpose | one extra op per task; quick add, CalDAV, email, MCP and import paths would all need the rule | every old task looks assigned to the owner after sharing | ✘ |
| C. Hide the assignee row in solo scopes | unchanged | none | — | ✘ ignores the explicit request |

A converges trivially because nothing is written. The display is a pure function of membership plus the field, so every device shows the same thing once membership has synced. Self-assignment for "Assigned to me" keeps working exactly as before, through the switch. Rows are unaffected: task rows only show assignees in shared projects.

### D4. Zone control
`ZoneControl` replaces the checkbox with a chip button: Icon `globe` plus "Floating", or `zoneCity(tz)` plus the current offset (from `Intl.DateTimeFormat(..., { timeZoneName: 'shortOffset' })`, falling back to `longOffset` and then to no offset). It opens a non-modal Popover with:
1. two radio-style rows, "Floating: same clock time everywhere" and "Fixed to a time zone: one moment worldwide";
2. a Combobox of zones from `Intl.supportedValuesOf('timeZone')` (falling back to the viewer's zone plus the zones in use by the user's tasks when unavailable), labelled by city with region and offset as secondary text, ranked with `pickRank` context `due.zone` and the viewer's zone pinned first;
3. a live preview line: "15:00 in New York = 21:00 your time (Berlin)".

Choosing a zone calls a new `setDueZone(due, zone, viewerZone)` in `lib/dates.ts`:
- from floating, it keeps the wall `date`/`time` and sets `tz`;
- from zoned, it keeps the wall `date`/`time` of the stored value and replaces `tz`, which re-interprets the time ("it's 3 pm in New York, not Berlin").

"Fix to my zone" and "Make floating" reuse `fixDueToZone` and `releaseDue`, so the `z` shortcut and the existing scenarios behave identically; the global `z` handler moves into `ZoneControl` unchanged. `isKnownZone` guards the stored value. The server already accepts any IANA `tz` (task-management "Zoned due sync and API format").

- *Alternative:* keep the instant when switching between zones. Rejected as the default: people switch zones to correct the meaning of the clock time, not to keep an instant they never saw. The preview makes the effect explicit before committing.

### D5. Tabs and chronological comments
`ConversationTabs` uses the `ui-primitives` Tabs pattern (automatic activation). The last tab is stored per device in `localStorage` under `ot.taskTab`, wrapped in try/catch with Comments as the fallback. `Shift+C` selects Comments, then focuses the composer and scrolls it into view (the same key guard as today).

- **CommentsTab:** threads oldest first using `threadOrder` (already creation-ordered), rendered with the Timeline `thread` item: Avatar, name, relative time (`formatRelative` with an absolute `title` and `aria-label` from date-time-preferences), Markdown body at `max-w-prose` with comfortable leading, actions in a hover-reveal row that is always visible on coarse pointers.
- **Composer:** stays at the bottom with the existing Composer logic (mention combobox, `Ctrl/⌘+Enter`), restyled as an auto-growing `Textarea` capped at about 10 lines. Its draft is kept in a module-level `Map<taskId, string>` mirrored to `sessionStorage` (`ot.draft.<taskId>`). That storage is device-local and cleared with the tab session, so no plaintext leaves the device and nothing lingers after the browser closes. This is the right weight for e2ee users.
- **Deleting a comment** uses the shared confirm Dialog instead of `confirm()`.

The "Load older" control for activity moves to the Activity tab. Comments are all local, so they need none.

- *Alternative:* keep one interleaved timeline with a filter. Rejected: the interleave is what makes it unreadable, and a three-way filter is a tab bar in disguise.

### D6. Activity runs
`lib/activityRuns.ts`: `groupRuns(events, { windowMs: 10 * 60_000 })` folds a newest-first event list into runs of consecutive events with the same `actor`, the same `task`, adjacent timestamps within the window, and no event from another actor between them. It is pure and deterministic, with unit tests over the shared activity fixture.

`summarizeRun(run)` builds the sentence from the event kinds, ordered by a fixed precedence (created, completed, renamed, rescheduled, moved, priority, assignee, labels, other) and deduplicated: "You renamed the task and changed the due date and priority" (two clauses plus "and N more" beyond that). A run is pending if any event id is in `pendingOpIds`. Comment kinds (`commented` and others) render as compact lines that select the Comments tab and scroll to `#comment-<id>`.

### D7. History versions
`lib/historyVersions.ts`: `toVersions(changeSets, { windowMs: 5 * 60_000 })` merges adjacent change sets with the same `userId` and `device` within the window. A field changed twice inside a version collapses to its first `from` and last `to`, while keeping each `opId` for lost markers.

`summarizeVersion(v)` maps fields to verbs with a stable order: title → "Renamed", due → "Rescheduled", project_id → "Moved", priority → "Reprioritised", completed_at → "Completed"/"Reopened", deleted_at → "Deleted"/"Restored", and the rest → "Edited <field label>". Verbs are joined with "and", with an Oxford comma beyond two.

Values are formatted through the existing `formatValue` plus `refNames`. Due values go through the date-time-preferences formatter; priority renders as a coloured Badge; labels as chips. Notes (`description` and `notes_doc`) show "Notes edited" with a "Show text" expander for `description` only, because Yjs updates are not human-diffable.

**Restore this version** collects `canRestoreField` fields and restores each to the version's `to` value. The confirm Dialog lists the fields. The restore runs `restoreValue` sequentially, so all ops share the panel's device and land within the same second, then `syncNow()` and reload, matching today's single-field flow. If a restore moves the task across scopes (a new id), the remaining field restores target the new id returned by the first call.

### D8. Reminders row
Layout only. Reminders render as Badge chips with a bell Icon, and the "Add reminder" Menu uses `kind="menu"` MenuItems for the relative presets plus "Custom…" and "At a time…". The editors are those delivered by `date-time-preferences`. Snooze and dismiss move into a per-chip Menu.

### Data model impact
None. No op fields are added, renamed or removed; `internal/sync/ops.go`, `web/src/lib/types.ts`, `internal/e2ee.ContentFields` and `CONTENT_FIELDS` are untouched. New device-local state:
- pick history contexts in the existing `pickHistory` table from `ui-primitives` (no new Dexie version);
- `localStorage` key `ot.taskTab`;
- `sessionStorage` keys `ot.draft.<taskId>`.

None of these are synced or exported.

### Size and runtime
No new dependencies. The client code adds roughly 8–12 KB minified. The tab components can be split so History (rarely opened) loads with its tab via `lazy()`. The image size, binary and server memory are unchanged.

Measured at apply (`npm run build`, gzipped): the entry chunk grew from 232.51 KB to 239.86 KB (+7.35 KB, within the 15 KB budget). The History tab is a separate lazy chunk of 9.41 KB (3.75 KB gzipped), fetched when the tab is first opened. No dependency was added.

## Risks / Trade-offs

- [Read-mode rows add one keystroke before editing] → Enter or Space on a focused row opens its editor, typing a printable character on a focused picker row opens the picker with that character, and existing global shortcuts still work without opening rows.
- [`Intl.supportedValuesOf` is missing on old WebKit] → fall back to the viewer's zone plus the zones in use, and accept a typed IANA name validated by `isKnownZone`.
- [Users read "You" in a solo project and expect the task in Assigned to me] → the switch sits right there with its label, and the help page explains the distinction.
- [Chronological comments put the newest far from the fields on long threads] → the Comments tab opens scrolled to the newest comment when the task has unread mentions, and `Shift+C` jumps to the composer.
- [A multi-field version restore is not atomic across devices] → each field converges independently by LWW, which the spec accepts (scenario "Version restore converges"). The dialog states that each field is restored as its own change.
- [Activity grouping could hide a change] → runs always expand, the count is shown ("and 2 more"), and grouping never crosses actors.
- [Coordination with siblings] → AssigneePicker and LabelPicker internals belong to `ui-primitives` and the date fields to `date-time-preferences`; this change only composes them. If either sibling is not yet applied, apply is blocked rather than duplicating their work.

## Migration Plan

This is UI only and can be shipped as one release. Order inside the change:
1. lib helpers with tests;
2. the properties rows and pickers;
3. the zone control;
4. the tabs (comments, activity, history);
5. docs and screenshots.

The layout check and the existing `e2e-views` and `e2e-smoke` scripts get updated selectors in the same step as the component they touch. Rollback is reverting the commit; there is no data to migrate.

## Open Questions

- Exact copy for summaries and the zone explanation. Wording can be tuned during apply and in the docs review without affecting the specs.
