# Proposal

## Why

Tidying notes is one note at a time: after an import, a project's end or a year of meeting notes, moving thirty notes into an archive project or labelling them `reference` means opening each one's menu thirty times. Task lists solved this with bulk actions (`bulk-actions`): tick rows, act once, undo once. Notes should work the same way, with the same keys, so nothing new has to be learned.

## What Changes

- **Tick standalone notes on the Notes page** with the task-list keys and gestures: `x` or Space, `Shift+↓`/`Shift+↑`, `Ctrl`/`⌘`+click, Shift+click, the grip on touch, `Ctrl`/`⌘`+`A` once one is ticked, Escape to clear, and **Select notes** in the header's overflow menu. Task notes and project notes are not ticked (they belong to their task or project), nor notes the user may only read.
- **The selection bar and Actions menu** (`.`): **Move to project** (`m`, reviewed first when a note would change sharing scope, as tasks are), **Labels** (`Shift+L`, the shared label picker with the all-or-add rule of task bulk labels), **Pin** / **Unpin** (`p`), **Turn into tasks**, and **Move to Trash** (Delete) last in the danger colour.
- **One batch, one Undo.** Each action is written as one batch of operations, applied locally first, offline included, and converging per note and field like single edits. The toast names the action ("12 notes moved to Archive") with Undo; trashing more than twenty asks first.
- Selection is device state, cleared when leaving the page, and works in List mode only (Graph mode has no selection).

No new op field, entity, route, dependency or mandatory environment variable. Not **BREAKING**.

Out of scope: bulk actions on task notes and project notes, bulk editing of note text (find and replace across notes), selection in Graph mode, bulk actions in `ot notes` (scripts loop over `ot notes edit`) and in the agent tools (which already take one note per call within the write limits).

Builds on `notes-space` (one-line rows) and `notes-sort` (the header's overflow menu, which this change also uses for Select notes; if `notes-sort` has not landed, this change adds the menu). Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: ticking standalone notes, the selection bar, the Actions menu and its actions.
- `bulk-actions`: the Notes page is a place where selection is available, with the note actions.

## Impact

- Web: `web/src/app/notes/NotesPage.tsx`, `NoteRow.tsx` (the checkbox slot and grip), the selection model reused from the task lists (`web/src/app/selection/*` or wherever `useSelection` lives) generalised over a row id and a "tickable" predicate, a `web/src/app/notes/NoteBulkActions.tsx` menu (lazy with the Notes chunk), `web/src/lib/notes.ts` batch writers through `mutateMany`, shortcut registry entries for the Notes page scope, tests and stories.
- Docs: `docs/notes.md` (a section "Several notes at once"), `docs/keyboard.md` (generated).
- Size: the menu and writers load with the Notes chunk; the shared selection code is already in the entry. Expected under 2 KB gzip in the Notes chunk.
