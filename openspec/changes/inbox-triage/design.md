# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The Inbox is a filter, not a container.** `TaskListView.tsx:120-121` lists open tasks with `project_id === null`; the Inbox is manually ordered (`docs/keyboard.md`: "Reorder tasks in project lists, boards and the Inbox"), with subtasks nested under their parent. A task dated from the Inbox stays in the Inbox.
- **Every decision already has a write path.** `updateTask(id, {due})`, `{project_id}` (moves the subtree, `lib/ops.ts:641-680`), `{assignee_id}` (`AssigneePicker.tsx:61`), `{labels}` (LabelPicker), `setTaskCompleted`/`completeTask` (recurring-aware, `toggleComplete` in the list), `deleteTask` (tombstones the subtree, `lib/ops.ts:798`), and `moveTaskAcrossScopes` for a project of another sharing scope (`lib/ops.ts:615-636`). The server refuses a plain `project_id` change across scopes (reason `scope_change`), which is why the panel uses the copy-plus-tombstone move.
- **Pickers and fields exist as components.** `datetime/DateField.tsx` (text input, calendar popover, `autoFocus`), `ProjectPickerField.tsx` (Combobox over `projectSource`, with the Inbox entry), `LabelPicker.tsx` and `AssigneePicker.tsx` (Combobox, `inline` mode), `NotesEditor` with `readOnly`. The assignee options come from the local membership cache (`lib/sharing.ts:59-66`): for `project_id === null` the only option is the user, so delegating from the Inbox needs a project first.
- **Views own their keyboard.** `Shell.tsx:101-150` handles the `g` chord and `?`; each view adds its own `keydown` listener and ignores events from text fields (`TaskListView.tsx:441-640`, Trash, calendar). The Vim layer (`vim/dispatch.ts`) routes `j`/`k`/`x`/`dd`/`G` through the `ListActions` a view registers with `registerListState` (`listActions.ts:11-60`) and leaves other keys alone.
- **The shortcut table is the single source** for the `?` overlay and `docs/keyboard.md` (`lib/shortcuts.ts`, `make docs`); Vim rows come from `vim/help.ts` and `COMMANDS` in `vim/commands.ts`.
- **Routes are a union** in `app/router.ts:5-27` with a path parser (`/trash` → `{view:'trash'}`) and the render switch in `Shell.tsx:196-217`.
- **Siblings.** `bulk-edit` (drafted) adds a device-local undo store and `Ctrl/⌘+Z` for its toasts; `someday-and-evening` (not yet drafted) owns `start: date | 'someday'`; `search-and-command-palette` will list commands by name.

## Goals / Non-Goals

**Goals:**
- One screen, one task, one key per decision, with the progress visible and announced.
- Reuse every write path and picker; introduce no new operation shapes.
- Keep the Vim layer working unchanged by registering the mode as a list.

**Non-Goals:**
- Undo (coordination with `bulk-edit`), timers, estimates, triage of other views, a changed Inbox list.
- A Someday substitute before `someday-and-evening` lands.

## Decisions

### D1. A route and a view, not a panel over the list

`{ view: 'triage' }` at `/triage`, rendered by a lazy `TriageView` in the Shell's switch next to `TrashView`. Entering from the Inbox header passes nothing: the view builds its queue from Dexie. Leaving (`Escape`, the Inbox link, the empty state) navigates to `{view:'inbox'}` and hands the current task id to the list through the existing `listState().select` after mount (the same hand-off the activity feed uses to open a task), so the Inbox opens with that row selected.

- **Alternative: a mode flag inside `TaskListView`.** Rejected: the list's keyboard handler is already 200 lines; a separate view with its own handler, its own help rows and a URL (so a reload lands back in the mode) is simpler and matches how Trash and the calendar are built.

### D2. The queue is a pure function of local data plus session state

`lib/triage.ts` exports `buildQueue(tasks, order)` (open, `project_id === null`, `parent_id === null`, sorted like the Inbox) and `advanceQueue(state, liveTasks)`:

```
TriageState = { ids: string[]; index: number; handled: Set<string> }
```

- On open: `ids` = the Inbox order at that moment, `index = 0`.
- A live query on `tasks` feeds `advanceQueue`: ids that no longer qualify are removed (and announced as "moved elsewhere" when it was the current one); qualifying ids not in `ids` are appended. `handled` holds decided and skipped ids so `k` can return to them and progress is `handled.size + 1 of ids.length`.
- `k` steps `index` back without changing `handled`; a decision on a revisited task does not count twice.

Pure and unit-tested with plain arrays; the view only wires it to `useLiveQuery`.

- **Alternative: recompute the queue from the Inbox on every change and show "n of current count".** Rejected: the number would jump as tasks are dated (they stay in the Inbox) or trashed, and skipped tasks would reappear; a session snapshot plus arrivals is what "4 of 17" means to a person.

### D3. Decisions call the existing helpers; delegate is one batch

| Key | Write |
| --- | --- |
| `t` | `updateTask(id, { due: { date: todayISO() } })` (keeps a time if there is one: `{...due, date}`) |
| `c` | the list's `toggleComplete(id, true)` path (`completeTask` for recurring tasks, parent prompt skipped in the mode) |
| `s` | `DateField` inline; on commit `updateTask(id, { due })` |
| `m` | `ProjectPickerField` sources; same-scope target → `updateTask(id, { project_id })`, other scope → `moveTaskAcrossScopes(id, { project_id })` (the panel's rule) |
| `a` | delegate picker (D4): `moveTaskAcrossScopes`/`updateTask` with `{ project_id, assignee_id }` in one call, so one batch |
| `l` | `LabelPicker` inline; no advance |
| Delete / Backspace | `deleteTask(id)` |
| `y` | present only when `someday-and-evening` is in the build (D5) |

Each helper is already the local-first op path; nothing is added to `ops.ts`. `updateTask` with both `project_id` and `assignee_id` is valid today (the assistant and bulk paths use it); `moveTaskAcrossScopes` already keeps or drops the assignee by destination membership (`ops.ts:598-602`), and the delegate picker only offers people who are members of the destination, so the assignee is always kept.

### D4. The delegate picker lists people with their project

Options come from `membershipMap()`: for every shared project the user is a member of (and may assign in, per task-assignment permissions), each member other than the user becomes an entry `{ person, project }`, labelled "Ana · Household", searchable on both names, ranked with the Combobox's existing recents. Choosing one performs D3's `a` row. With no entries the button is disabled with "Delegating needs a project you share"; `a` is a no-op. This is the honest form of "delegate" in a personal Inbox: a task can only be assigned to someone who can see it.

- **Alternative: assignee picker first, then ask for the project.** Rejected: two dialogs for one decision, and the person list would be empty for the Inbox.

### D5. Someday is compiled in behind a capability check, not a stub

The Someday button, its key, its shortcut row and its help entry are gated on a single `hasSomeday` constant exported from the sibling's data layer (the `start` field's defaults in `lib/ops.ts` once `someday-and-evening` lands). Until that export exists the gate is `false` and the code path is tree-shaken; `tasks.md` of `someday-and-evening` (or of this change, if it lands second) flips it and adds the `start: 'someday'` write. No `@someday` label and no "no date" stand-in: the GTD guide's label advice is the workaround for today's app, not something this mode should teach.

### D6. Keyboard ownership and the Vim layer

`TriageView` registers a `ListState` whose `rows()` is the queue in order, `selected()` the current id, `select()` sets the index, `open()` opens the detail panel, `manual()` is false, `toggleComplete` is the `c` decision and `focusQuickAdd` returns false. The Vim dispatcher then gives `j`/`k`/`x`/`dd`/`G`/`gg` their meanings for free, and `:q` closes the panel or, with none open, leaves the mode (`closePanel` → navigate to the Inbox). The view's own `keydown` handler maps the decision keys and ignores events whose target is a text field or lies inside an open picker (`data-overlay-root`), the same guard the list uses. `COMMANDS` gains `{ name: 'triage', desc: 'Process the Inbox one task at a time' }`.

`g` then `p` goes into `Shell.tsx` next to `g x`; `p` is unused in the chord today. "p" is also the calendar's placement key, which is harmless: the chord only fires after `g`.

### D7. Announcements and layout

The card is `<section role="group" aria-labelledby=…>` with `tabIndex=-1`, focused on open and after every advance so arrow keys and Space act on it rather than on a button that happened to have focus. One polite `role="status"` region receives two messages per decision: the outcome ("Scheduled for Fri 16 Oct", built from `formatDate(iso, 'compact')`, "Moved to Work", "Delegated to Ana in Household", "Moved to the Trash", "Completed", "Skipped") and then "n of N: title"; `lib/triage.ts` provides the strings so they are tested. Buttons are `btn-ghost` with a `.kbd` hint, laid out with `flex-wrap`, two rows at 360 px (checked by the existing layout script at 360/390/768). Reminders and labels on the card reuse the row chips.

### D8. Entry points and docs

The Inbox header shows **Process** with the open count (hidden at zero), placed where the project header shows its actions; `g` `p`; `:triage`; and a `screen="inbox/triage"` HelpLink to the new section of `docs/views.md`. `shortcuts.ts` gains one row in `go` (`g then p`) and one block in a new section `triage` ("Inbox triage": `t / c / s / m / a / l`, `Delete`, `j / Space / k`, `Enter`, `Esc`); `make docs` regenerates `docs/keyboard.md` and the help bundle.

### Interface budget (added after ux-overhaul)

- One button in the Inbox header (**Process** with the count) and one page outside the lists. No sidebar destination: it's reached from the Inbox, `g` `p` and `:triage`.
- The decision bar wraps at 360 px (checked by the layout check).
- New keys are scoped to the mode and listed in their own shortcut section.

## Risks / Trade-offs

- **[Keys collide with list habits (`a` adds a subtask, `s` schedules in Day view)]** → The mode is a separate screen with its own bar that shows every key; the `?` overlay lists the triage section; `a` and `s` keep their list meanings outside the mode.
- **[A decision on a task that another device just changed]** → Each decision writes only its own fields, so the fields merge (spec "Two devices decide differently"); a task that left the Inbox is dropped from the queue by the live query before the next key lands, and the announcement says so.
- **[The user expects undo]** → Every decision is reversible by hand and `k` returns to the previous task; the toast-with-Undo arrives with `bulk-edit`'s shared undo store, and this change's task 5.2 or that change's follow-up wires triage decisions into it. Documented in the Views guide until then.
- **[Vim `d` prefix delays Delete]** → Plain Delete/Backspace trashes without a prefix in both modes; `dd` is the Vim extra, as in lists.
- **[Someday gate drifts]** → One exported constant, one test in each change asserting the button's presence matches it.
- **[Bundle growth]** → A few KB, lazy-loaded with the view like Trash and the feed.

**Data model impact:** none. No field, entity, route or setting; every write is an existing op shape.

## Migration Plan

Nothing to migrate or roll back; the route simply does not exist in older builds.
