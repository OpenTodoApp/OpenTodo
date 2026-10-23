# Proposal

## Why

Part 4 of the "Precision" redesign, change 9 of the build plan (after `precision-tokens`, `precision-shell` and `precision-rows`). The round-2 mock-ups (`quickadd.png`, `palette.png`, `phone-quickadd.png`) take direction B's quick-add palette and draw it in A's tokens:

- **Quick add shows what it understood as fields, not as a cloud of coloured chips.** Each attribute is a row with its name, its value and the token that sets it. An unset field says how to set it ("none · type “+30m”"). The line itself keeps the inline tints, so the row and the words it came from read together.
- **⌘K is the same shell:** one card near the top of the screen, a large borderless field, results under quiet headings, the selected task named in the field, shortcuts as keycaps at the right of each row ("G then U"), and a footer that teaches the keys.
- **On a phone, quick add is a sheet** with the line, the understood fields as plain chips, and a tool row to start a date, a priority, a label, an estimate or a project with a tap.

Today the command bar's Add mode is the list's quick-add line inside a dialog: chips in many hues, a segmented control and a hint paragraph above the results. Keys are printed in the secondary line as text. On the phone, the sheet is the same desktop line.

## What Changes

- **The quick-add palette (the command bar's Add mode):**
  - The input row: a `+` mark, the line with its tints at 15 px.
  - Then the field rows: When, Project, Label, Priority and Estimate always; Deadline, Repeats, Reminder and Time spent only when the line sets them.
  - Each row shows its icon, its name and its value. Unset rows show a hint in faint text. At the right is the token that sets the row (`#`, `@`, `p`, `+`).
  - A set row has a "Keep as text" control, as the chips have now.
  - ↓ and ↑ from the field highlight a row; Tab, or a click, edits the highlighted row. Editing selects the row's words in the line, or starts its token at the end of the line, which opens the project or label suggestions.
  - The footer shows the title as it will be saved, or "Understood as you type" before any attribute is found. It also shows `↵ Add`, `⇧ ↵ Add and open` and `Esc Close` (or `Back` when Add was reached from Search).
  - **Shift+Enter adds the task and opens it.**
- **⌘K in the same shell:**
  - From 640 px the command bar is a 640 px card near the top of the screen. It has no title bar and a borderless 15 px field with a search mark.
  - When a task is selected, its title is a small chip at the right of the field.
  - Headings are in sentence case.
  - The active row has the selected-row surface with its accent bar.
  - Each command's shortcut is shown as keycaps at the right of the row, a sequence as "G then U".
  - A footer shows `↑ ↓ Choose`, `↵ Run`, and names the `+`, `>` and `?` prefixes.
  - The segmented control stays on phones and touch screens. On a desktop with a mouse, the footer's prefix hint replaces it.
  - Escape closes Add mode when the bar was opened in Add mode (`q`, a "New task" command); when Add was reached from Search, Escape still returns to Search.
- **Quick add on a phone (the floating add button's sheet):**
  - The line, at 16 px.
  - A row of neutral chips for what the line sets, each one dismissable, and a dashed placeholder for the project or label when the line has none.
  - A tool row: date, priority, label, estimate and project buttons, each starting its token in the line, and a round accent send button.
- **The list's own quick-add line, the capture screen and the title editors keep their chips** (`ParseChips`). The parser and its Go port are untouched: the same line gives the same task everywhere.

Out of scope:
- The quick-add parser, its vocabulary and the shared vectors: no change.
- The list's inline quick-add line and its position, which other Precision changes may restyle.
- The task page's composer (`task-full-page`) and the assistant's composer (`assistant-surface`).
- The phone's top bar, tab bar and rows (`precision-phone`).
- Renaming Filters to Views in the palette's headings belongs to `views-and-display`.

ROADMAP: advances the Precision redesign (design round 2, build plan item 9). No **BREAKING** change: no environment variable, no op or schema change.

## Capabilities

### Modified Capabilities

- `command-palette`: four requirements change.
  - "Open and close the palette": the card, the footer instead of the segmented control on a desktop, and Escape in Add mode.
  - "Palette sections and recents": headings, the selected-task chip, shortcuts as keycaps.
  - "Add mode": the field rows, editing a row, Shift+Enter.
  - "Discoverability and help": the footer names the prefixes.
- `natural-language-capture`: "Live preview chips" now names the form the preview takes in each place, and a new requirement covers the phone sheet's tools ("Quick add tools on a phone").
- `keyboard-shortcuts`: "Registry drives the guide and the palette": the palette shows sequences as keycaps joined by "then", and the registry lists the palette's local keys (Shift+Enter, the field rows' arrows and Tab).

## Impact

- **Web:**
  - `app/palette/CommandPalette.tsx`, `BarParts.tsx`, `entries.ts`: the shell, the footer, the context chip and the shortcut column.
  - `app/QuickAdd.tsx`, plus a new `app/quickadd/` folder: the field rows, the sheet bar and the token starter.
  - `app/QuickAddSheet.tsx`.
  - `ui/overlay/Dialog.tsx`: a `palette` placement.
  - `ui/Combobox/Combobox.tsx`: a `palette` look and a trailing slot.
  - `lib/shortcuts.ts`: two local entries.
  - New strings in the five catalogs.
- **Server, API, sync, data:** none.
- **Bundle:** about 3 KB of JS and CSS in the palette's lazy chunk and the main chunk. No dependency.
