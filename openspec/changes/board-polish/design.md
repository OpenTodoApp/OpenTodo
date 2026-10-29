# Design: board-polish

## Context

A board column is one sunken surface holding a header (icon or dot, title, count, column menu) and cards (`sections-and-boards` "Board view"). The list layout already collapses a section per device (`web/src/lib/sections.ts` `setSectionCollapsed`, stored with `setMeta` under the project, never synced); a saved view collapses its groups per device (`web/src/app/collapsedGroups.ts`, keyed `view:group`). A card shows the title on at most two lines and then one property row. Notes are the rich-text `notes_doc` with its Markdown projection `description`; both are E2EE content fields, decrypted on the device. Project boards have no display panel (`list-display-options`: the Board layout shows no display button); saved views carry all their options in the display panel (`custom-views` "Display panel").

## Goals / Non-Goals

**Goals:** fold any board column to a strip and back, keeping it a drop target; an opt-in two-line plain-text notes preview on cards; both offline, keyboard-reachable, announced, and fine on a phone.

**Non-Goals:** synced fold state, rich previews, list-layout previews, new board kinds.

## Decisions

### D1. The fold state is the existing per-device collapse state

A board column folds exactly when its section (project board) or group (saved view, board of filters) is collapsed in the existing per-device stores: `sections.ts` for project sections, `collapsedGroups.ts` for view groups and filter panels. Folding on the board collapses the section in the list on that device and the other way round.

- *Alternative: a separate board-only fold store.* Rejected: two states for "I don't want to see Done right now" would disagree between layouts, and the issue asks to reuse section collapse.
- *Alternative: sync the fold in `project_prefs`.* Rejected: section collapse is per device by spec, and a phone and a wide screen want different things. Keeping one rule is calmer.

No data model change; nothing is written to the op log.

### D2. The folded strip

A folded column is a strip 40 px wide (48 px below 640 px, to meet the touch target) of the same sunken column surface and the full board height. Top to bottom: the section's icon or colour dot, the open-task count in the muted tone with tabular figures, and the name written vertically (`writing-mode: vertical-rl`), truncated with an ellipsis. The whole strip is one button: accessible name "<name>, <n> open tasks, folded", `aria-expanded="false"`, activation unfolds. Hover and focus follow the card elevation rule (the strip lifts like a card). Fold is offered in the column menu ("Fold column" / the strip itself unfolds) so the header gains no control and the interface budget is unchanged. The "No section" column folds too. The "Add a section" column never folds.

- *Alternative: a chevron in every column header.* Rejected: one more control per column; the menu and the shortcut are enough, and the strip is its own unfold control.

### D3. Folded columns stay drop targets; moves land without unfolding

Dropping a card on a strip, or Shift+Left/Right from an adjacent column, moves the task last into that section or group as every move does (`sections-and-boards` "Move tasks between sections"): one ordinary op, offline, converging by last writer wins. The column stays folded (the common flow is "fold Done, then throw cards on it"). While a card is dragged over the strip, the strip shows the drag placeholder's dashed edge around its whole length instead of a card-height placeholder. After a keyboard move into a folded column, the selection moves to the next card of the origin column (or the previous when it was the last), and a polite live region announces "Moved to <name>". On a saved view, a drop follows the view's `on_drop` rule as an unfolded column does; a column that refuses drops refuses them folded too. `h`/`l` (select the first card of the previous or next column) skip folded columns.

### D4. Notes preview: where the option lives and how it is stored

- **Project board:** a checkable item "Show notes on cards" in the board's page menu (the header's overflow), stored as the additive boolean `project_prefs.card_notes`, so it is personal (each member of a shared project chooses for themselves, a viewer included), synced to the user's devices and converging per field.
- **Saved view in the Board layout:** a switch "Notes on cards" in the display panel's "Show on rows" part, shown only when Layout is Board, stored as the additive boolean `view.card_notes`.

Default `false` for both; unknown or missing reads as off. Simple-list users (who never pick a board) see nothing new; a board user sees one new menu item.

- *Alternative: per device.* Rejected: every other display choice of a project or view is synced; a preview that appears on the laptop and not the phone would look like a bug.
- *Alternative: one account-wide setting in Settings › Appearance.* Rejected: a grocery board wants none, a client-work board wants it; it is a property of the board.
- *Alternative: give the project board a display panel.* Rejected for now: one switch does not justify a panel and it would change `list-display-options`' "Board unchanged" rule. If a second board option arrives, the menu item moves into a panel then.
- *Alternative: a new `hidden_props`-style property "notes" shown by default.* Rejected: the preview must be opt-in, and `hidden_props` means "shown unless hidden".

### D5. Keyboard

One new registry row: `board.fold`, keys `z`, scope `board`, section "Board and timeline": "Fold or unfold the selected card's column; on a folded column, unfold it". With no card selected, `z` acts on the column whose header or strip has focus. The registry's conflict test must pass: `panel.zone` (`z`) is in the `panel` scope and only while the task panel has focus, so the two never compete; `vim.*` rows do not use `z`. Tab reaches each strip in column order; Enter or Space unfolds. The `?` sheet and docs/keyboard.md pick the row up from the registry.

### D6. Preview text

A pure function `notesPreview(description: string): string` (in `web/src/lib/notesPreview.ts`) turns the Markdown projection into one plain-text string: headings, emphasis, code marks and quote markers removed; links become their text; images, attachments, embeds, tables and horizontal rules dropped; list and checklist items become their text separated by " · "; mentions keep their display text; whitespace collapsed; at most 280 characters kept. The card renders it under the title, clamped to two lines with an ellipsis, at the metadata size in the muted tone; it is part of the card's accessible name after the title ("Notes: …"). An empty result renders nothing (no empty line). The function is memoised per task id and `description` value, so a board of several hundred cards renders without re-parsing.

- *Alternative: render from `notes_doc`.* Rejected: the doc needs the editor's schema code on the board path; `description` is already the plain projection every client writes with it.

### D7. Encrypted accounts, offline, viewers

`description` is decrypted on the device before any view reads it, so the preview needs no new crypto and works offline. When a task's notes are still ciphertext on this device (key not unlocked, or a value from a newer key not yet available), the preview is empty, never ciphertext (`e2ee.IsCiphertext` on the client side). The server never renders cards or previews. Viewers of a shared project see previews like members; they cannot edit, fold is device state so they can fold.

### D8. Interface budget

Chrome above the board is unchanged (one menu item in the overflow, one switch inside an existing panel). A card shows at most seven things by default; the preview is off by default, and when on it counts as one of them (title, preview, and the property row's facts as today). No new scroll region: a strip lives inside the board's existing horizontal scroller; columns still scroll alone. No new sidebar destination.

### D9. Phone layout

Below 640 px columns are 88 % wide with snapping and a dot pager. A folded column becomes a 48 px strip in the row; snapping treats it as its own snap point at its start so a swipe never stops half-way into it; the pager shows one dot per unfolded column, and the page bar's column name skips strips. Tapping a strip unfolds it and scrolls it into view. The preview on a phone card is also two lines.

## Risks / Trade-offs

- [A folded column hides work people forget about] → the count stays visible on the strip and the column is announced as folded.
- [Vertical text is hard to read in some languages] → the name is truncated and also in the strip's accessible name and tooltip; a 40 px strip fits German and French names truncated without overflow (checked by the layout run at 360 px).
- [Preview text leaks something the user did not expect on a shared screen] → it is opt-in per board.
- [Markdown stripping misses an edge case] → table-driven tests of `notesPreview` with every block and mark the editor writes.

## Migration Plan

Additive fields only; older clients ignore `card_notes` and keep showing cards without a preview. No migration; rollback leaves the fields unused.
