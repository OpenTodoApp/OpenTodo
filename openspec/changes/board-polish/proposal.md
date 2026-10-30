# Proposal: board-polish

## Why

Boards are where people run a project's flow, and two small gaps make them harder to live with (issue #561, split from the calendar and board umbrella #427). A finished or parked column ("Done", "Later") takes as much width as the one being worked on, so the board scrolls sideways for columns nobody is reading; Trello, GitHub Projects and Vikunja all let a column fold away. And a card shows only its title and one property row, so the one line of context people wrote in the notes ("waiting on the quote from Marco") is a click away on every card. The research ranks Kanban among the table-stakes views users expect when they leave Todoist, TickTick or Vikunja (research §1), and the roadmap places this in 0.19 "Series and time" as `board-polish`.

## What Changes

- **Fold a board column.** Any column of any board (a project board, a saved view in the Board layout, a board of filters) can be folded from its column menu or with `z` into a narrow strip that shows the column's colour dot or icon, its name written vertically and its open-task count. Activating the strip unfolds it. The folded state is per device and is the same state as collapsing that section or group in the list layout, so "Done" folded on the board is collapsed in the list on that device too, and the other way round.
- **Folded columns stay drop targets.** Dragging a card onto a folded strip, or pressing Shift+Left/Right into a folded column, moves the task to the end of that section or group as any move does, without unfolding it; the count updates and the move is announced.
- **Notes preview on cards (opt-in).** A board can show the first two lines of each card's notes, as plain text in the muted tone, between the title and the property row. It is off by default. A project board turns it on from the board's page menu ("Show notes on cards"), stored in the user's personal preferences of that project; a saved view in the Board layout turns it on in its display panel, stored on the view. Both sync and converge per field.
- The preview is computed on the device from the task's notes (the Markdown projection `description`), so it works offline and on encrypted accounts exactly like the notes themselves; the server never renders it.
- Phone layout: a folded column is a 48 px strip in the swiping row, the pager shows a dot per unfolded column, and the strip unfolds on a tap.

## Out of scope

- Collapsing cards themselves, card cover images, or a "compact cards" density.
- Column WIP limits, swimlanes or per-column sorting (anti-roadmap: no enterprise bloat).
- Syncing the folded state across devices (it follows the per-device rule section collapse already has).
- Rich rendering (formatting, images, checklists as controls) inside the preview: it is plain text.
- Notes preview in the list layout (rows have the Detailed layout of `row-layouts`) and on public links.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `sections-and-boards`: the Board view requirement places the optional notes preview on cards; new requirements for folding a column (per device, shared with section collapse, drop targets, keyboard, phone, assistive technology) and for the notes preview (plain text, two lines, opt-in per project for the user, offline and E2EE); the workbench requirement gains the folded and preview states.
- `custom-views`: the Display panel gains a "Notes on cards" switch in the Board layout, stored on the view.

`keyboard-shortcuts` is unchanged at the requirement level: `z` is one new row of the registry in the board scope (design D5).

## Impact

- **Data model and sync:** two additive booleans, `project_prefs.card_notes` and `view.card_notes`, default `false`, in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. They are settings, not user-written text: not E2EE content fields. No op format change, nothing **BREAKING**. The folded state is device storage only (the existing collapsed-section and collapsed-group stores), never synced.
- **E2EE:** none new. The preview reads the decrypted `description` on the device; when the notes cannot be decrypted the card shows no preview.
- **API / CLI / MCP:** `GET/POST/PATCH /api/v1/views` read and write `card_notes` as a boolean (docs/api.md views table); project preferences stay sync-only as today. No CLI or MCP change (they do not render boards).
- **CalDAV, vault:** none.
- **Web:** `web/src/app/BoardView.tsx`, `web/src/app/Sections.tsx` (column header and menu), the board card in `web/src/app/TaskListView.tsx`, `web/src/app/views/DisplayPanel`, `web/src/lib/sections.ts` (collapse store reused), `web/src/lib/shortcuts.ts` (one row), a new pure `web/src/lib/notesPreview.ts`; stories in `board.stories.tsx`.
- **Bundle and binary size:** under 2 KB gzip for the preview text function and the strip; no dependency. Server binary unchanged apart from two schema entries.
- **i18n:** about eight new strings in the six catalogs.

Fixes #561
Relates to #427
