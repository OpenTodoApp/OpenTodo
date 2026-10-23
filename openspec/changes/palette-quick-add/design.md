# Design

## Context

The command bar (`app/palette/CommandPalette.tsx`) is a `Dialog` (size `md`) with four modes:
- **Search** and **Commands** use the shared `ComboboxField` and `ComboboxList`.
- **Add** renders `AddPanel`, which is the list's `QuickAdd` line in a bordered box.
- **Ask** is a one-line form.

A segmented `ModeSwitch` and a `BarHint` paragraph sit between the field and the results. Command shortcuts are joined into the secondary text by `secondaryOf`.

`QuickAdd` owns the parse state: the value, dismissed spans, the Backspace highlight, suggestions and dictation. It renders the input with its tints and, under it, `ParseChips` plus the "→ title" preview. The phone's floating add button opens `QuickAddSheet`, which is a `Popover` (a bottom sheet below 640 px) holding the same `QuickAdd`.

The round-2 mock-ups are the target (`quickadd.png`, `palette.png`, `phone-quickadd.png`; system tokens in `round2/system.md`: palette width 640, rows 32 and 34 px, the selected-row surface with an accent bar, the pop surface).

## Goals / Non-goals

**Goals:**
- One palette shell for Search, Commands and Add.
- Quick add shows its understanding as field rows (desktop) or neutral chips plus a tool row (phone).
- Keys are shown as keycaps where the mock-ups show them.

**Non-goals:**
- Any parser change. The Go port, the vectors and the `toTaskInput` path are untouched.
- The list's inline line, the capture screen and the title editors.

## Decisions

### D1. One `QuickAdd`, three presentations

`QuickAdd` gets a `layout` prop: `line` (default, today's), `palette` or `sheet`. The parse state, the suggestions, dismissal, dictation and submit stay in one place. Only the part under the input changes:
- **`line`:** `ParseChips` and the title preview (unchanged).
- **`palette`:** `FieldRows` (new, `app/quickadd/FieldRows.tsx`) and the palette footer.
- **`sheet`:** `SheetBar` (new, `app/quickadd/SheetBar.tsx`): the chip row and the tool row.

This keeps the "same field, same tints" rule of `natural-language-capture` true by construction. Alternative: a second component that copies the state logic. Rejected: two places to drift.

### D2. The rows are a view of the line; editing goes through the line

The line stays the only model. A field row shows the chip of its kind, and nothing else.

- **"Keep as text"** on a row is the chip's dismiss.
- **Editing a row** (Tab on the highlighted row, or a click):
  - **The row is set:** the words its chip came from are selected in the input, so typing replaces them and the parser reads the new words.
  - **The row is unset:** the row's token is started at the end of the line, after a space (`#` for Project, `@` for Label, `p` for Priority, `+` for Estimate), and the caret is put after it. For `#` and `@` the existing suggestion list opens (`suggest.openAt`).
  - **When is unset:** the caret goes to the end after a space, and the row's hint says what to type ("type a day, like “friday”").

Alternatives considered:
- Pickers that write tokens back into the line. A date picker would have to write a phrase that parses in every active language. Deferred: a later change can add it on top of D2.
- Separate state per field. Rejected: the line and the task would disagree.

**The key column** shows the token the row takes (`#`, `@`, `p`, `+`), not the mock-up's invented letters (D, !, ~). The parser's grammar is the source of truth, and changing it is out of scope. When has no key: dates are words. This deviates from the mock-up on purpose; it is recorded in the questions for the owner.

### D3. Keys in the quick-add palette

- **↓ / ↑ in the input** move a highlight over the rows: the first ↓ highlights the first row, and ↑ from the first row removes the highlight. They do this only while no suggestion list is open; the list keeps its own arrows.
- **Tab with a row highlighted** edits it (D2) and removes the highlight. Tab with no highlight moves focus as usual, so the dialog's focus order stays intact.
- **Enter** adds and keeps the palette open, empty and focused (unchanged).
- **Shift+Enter** adds and opens the new task. It closes the bar, selects the task and opens the list it went to, the same target as the toast's Open.
- **Escape** first clears a row highlight or closes a suggestion list. Then it closes the bar when Add was the opening mode, or returns to Search when Add was switched to from Search.

Shift+Enter and the row keys are registered as local entries in `lib/shortcuts.ts` (`palette.add-open`, `palette.fields`), like `palette.add-task`. They are "local" (handled by the field) so they bind no global key and cannot conflict.

The mock-up shows the first row highlighted at rest. That would make Tab edit a row instead of leaving the field, so at rest nothing is highlighted, and the first ↓ produces the mock-up's state.

### D4. The shell: a `palette` placement of `Dialog`

`Dialog` gets `placement="palette"`:
- **From 640 px:** the card sits 12 vh from the top (not centred, so the field does not jump as results change), 40 rem wide, on the pop surface with the popover radius, with `overflow: hidden`. There is no title bar: the title stays as the accessible name (visually hidden), and the close button sits at the right end of the first row, which leaves room for it. The body has no padding.
- **Below 640 px:** the full-screen sheet with its title bar, exactly as today.

The command bar uses it in every mode. The confirmation, prompt and picker steps keep the plain dialog.

### D5. Results in the palette look

`ComboboxField` and `ComboboxList` get `look="palette"`:
- **The field:** borderless, 15 px, with a search mark and a hairline under it; while it has focus, the field row shows the inset focus ring (the accessibility gate needs a visible ring).
- **Headings:** sentence case at 11.5 px in faint text, instead of uppercase.
- **Rows:** 34 px. The active row uses `.row-selected` (the selected-row surface and the 2 px accent bar from `precision-rows`).
- **A `renderTrailing` slot**, used for the shortcut.

`secondaryOf` gains an option to leave the shortcut out. The palette then renders `KeySequence` (the tooltip's helper, precision-shell D4) at the right of the row, so `g u` reads as "G then U" and `Ctrl+K` as one key. Other comboboxes are unchanged.

**The context chip:** when the bar opens with a selected (or open) task, the field's right end shows a chip with a check mark and the task's title, cut to one line. It is decorative: the context commands already name the task.

### D6. Footer instead of the segmented control on a desktop

The footer is a strip on the raised surface:
- **Search and Commands:** `↑ ↓ Choose · ↵ Run` on the left. On the right, "Type + to add, > for commands, ? to ask" (without Ask when it is unavailable).
- **Add:** described in D3.

The footer's key hints show only on a fine pointer (`@media (pointer: fine)`). The segmented control shows on a coarse pointer and below 640 px, where typing a prefix is awkward.

The `BarHint` paragraph above the results is removed. Its Help link moves into the footer. Both elements stay in the document in both cases (CSS decides), so tests and assistive technology see one consistent structure.

### D7. The phone sheet

`QuickAddSheet` keeps its `Popover`: a bottom sheet with a handle below 640 px, and a popover by the button from 640 px. Inside, `QuickAdd layout="sheet"`:
- **The line** at the 15 px prose size, as in the palette.
- **A chip row**, horizontally scrollable:
  - one neutral chip per understood attribute, on the raised surface, 30 px, each with its icon and a dismiss control;
  - then a dashed placeholder chip for Project and for Label when the line sets none. Tapping a placeholder starts that token (D2).
- **A tool row:** five 38 px icon buttons (When, Priority, Label, Estimate, Project) that start their tokens (D2), and a round 36 px accent send button that submits the form.

The buttons keep focus in the input (`onMouseDown` prevents default), as the dictation button already does.

### D8. Interface budget

The palette is an overlay, so the list's chrome budget is unaffected. No new task properties are shown. No sidebar destination is added. The palette has one scroll region (the results, or the field rows when long). The new keys are local registry entries; the conflict test covers them.

## Data model

None. No op, field or schema change. Adding a task goes through the same `createTask`, `addFromBar` and `toTaskInput` path as before. It works offline and converges like any creation.

## Size

- About 3 KB minified across the palette's lazy chunk (the footer, the field rows) and the main chunk (`QuickAdd`'s sheet bar, the Dialog placement).
- No dependency.
- No effect on the image size or the server's memory.

## Risks / Trade-offs

- **No title bar from 640 px:** the close button stays, small, at the end of the field row (the layout check requires a hit-testable close control on every dialog); Escape and a click on the scrim close too.
- **The key column differs from the mock-up (D2).** Recorded for the owner.
- **Tab edits a highlighted row.** It only does so while a row is highlighted with the arrows, so plain Tab never changes behaviour.
