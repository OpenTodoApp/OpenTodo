# keyboard-shortcuts Specification

## Purpose
Defines how keyboard shortcuts are registered, scoped, resolved and shown to the user: one registry that drives the cheat sheet, the keyboard guide, tooltips and the palette, so shortcuts never conflict and are discovered where the action is.

## Requirements

### Requirement: One shortcut registry with scopes
Every keyboard shortcut SHALL be declared once in a registry entry with its keys, its action, a description, a section and a scope: `global`, `view` (one named view), `list` (a task list has focus or a row is selected), `panel` (the task panel), `board`, `calendar`, `editor` (notes or comment composer) or `vim`. Every entry whose keys include a sequence SHALL also have a short label of at most 24 characters, used where space is short (the sequence spotlight, the cheat sheet). One dispatcher SHALL resolve a key press to the innermost active scope. No shortcut SHALL be handled outside the dispatcher.

#### Scenario: Innermost scope wins
- **WHEN** the task panel has focus and the user presses `1`
- **THEN** the panel's priority action runs, not the list's, and only once

#### Scenario: Scope not active
- **WHEN** no task list is on screen and the user presses `c`
- **THEN** nothing happens and no error is logged

#### Scenario: Sequence without a short label
- **WHEN** a change adds `g Shift+T` without a label, or with a label longer than 24 characters
- **THEN** the registry test fails naming the entry

### Requirement: Conflicts fail the build
A unit test SHALL fail when two registry entries bind the same keys in the same scope, or in a scope and an ancestor scope without an explicit override, and SHALL name both entries. The same test SHALL fail when the keyboard guide or the cheat sheet would show a shortcut that is not in the registry.

#### Scenario: Duplicate binding
- **WHEN** a change registers `Shift+S` for "Skip occurrence" in the `list` scope while "Share project" holds `Shift+S` in the `view` scope of a project
- **THEN** the test fails naming both entries

### Requirement: Resolved conflicts
The registry SHALL resolve the conflicts of the previous flat list: `Shift+S` is Share project only (project view); Skip occurrence is `Shift+K` in the list and panel scopes; `s` is Schedule in a list, Save in the Filter view and `g s` for Settings; `.` opens the menu of the focused row, or the Actions menu when tasks are ticked; `a` adds a subtask in a list and a card in a board column.

#### Scenario: Skip an occurrence
- **WHEN** a recurring task is selected and the user presses `Shift+K`
- **THEN** the occurrence is skipped, and `Shift+S` in a project still opens Share

### Requirement: Cheat sheet
`?` SHALL open a cheat sheet dialog that lists, first, the shortcuts of the scopes active right now, then "Everywhere" and "Go to", then the remaining sections, each as a titled group. Each shortcut SHALL be one row with its short label (or its description clamped to one line, with the full description in the row's accessible name and tooltip) and, aligned to the end of the row, its keys as separate keycaps: the chords of a sequence joined by "then", alternatives joined by "or", and a condition shown as muted text under the label, never inside a keycap. A keycap SHALL never wrap, and keys and text SHALL never overlap at any width from 360 px. Groups SHALL flow in one column below 768 px, two from 768 px and three from 1280 px. The sheet SHALL have a search field that stays visible while the list scrolls and filters by key, label or description, SHALL be at most 80 % of the viewport height with its own scroller, and SHALL render from the registry. After the shortcuts it SHALL list the quick add syntax, including a line for the `#` and `@` suggestions.

#### Scenario: Context first
- **WHEN** the user presses `?` while a board is shown
- **THEN** the first group is "Board", followed by "Tasks in a list", "Everywhere" and "Go to"

#### Scenario: Search the sheet
- **WHEN** the sheet is open and the user types "dead"
- **THEN** only the deadline shortcuts remain, across every group

#### Scenario: Fits the screen
- **WHEN** the sheet opens on a 1280×800 screen
- **THEN** its header, search field and close button are visible, its groups are in three columns, and its content scrolls inside the dialog

#### Scenario: Sequences and alternatives read as keys
- **WHEN** the sheet shows "Go to Today" and "Move the selection down"
- **THEN** the first row's keys read as the keycaps `g` then `t`, and the second's as `j` or `↓`, each keycap on one line

#### Scenario: Nothing overlaps on a phone
- **WHEN** the sheet is open at 360 px wide
- **THEN** every row's keycaps sit on its own lines without touching the label or the next row, and the layout check finds no overlapping boxes in the sheet

#### Scenario: Conditions outside the keys
- **WHEN** the sheet lists the shortcut that applies or discards proposed changes
- **THEN** its keycaps read `Enter` or `Esc`, and "proposed changes" is muted text under the label, not inside a keycap

#### Scenario: Suggestions are discoverable
- **WHEN** the user opens the cheat sheet and searches for `@`
- **THEN** a quick add row says that `#` or `@` followed by a few letters suggests projects or labels, that Enter or Tab picks, and that `#Home/Docs` picks a sub-project

### Requirement: Shortcut hints live in tooltips and menus
Shortcut hints SHALL be shown in the tooltip of the control that runs the action, beside the item in menus and the palette, and in the cheat sheet. No key badge SHALL be printed in the chrome (headers, inputs, subtitles, prompts) unless the "Show shortcut hints" preference is on. The guide text that names a key SHALL name the action first.

#### Scenario: Hover the Share action
- **WHEN** the user hovers or focuses the Share action of a project
- **THEN** its tooltip reads "Share project · Shift+S", and no key badge is printed next to the action

#### Scenario: Hints preference
- **WHEN** the user turns on "Show shortcut hints" in Settings → General → Keyboard
- **THEN** quick add shows its `q` badge again and section headers show their keys, on this device only

### Requirement: Registry drives the guide and the palette
The keyboard guide in the documentation and the shortcut column of the command palette SHALL be generated from the registry, grouped by section, so the three never disagree. The guide SHALL render keys with the same keycap rules as the cheat sheet (one keycap per chord, "then" and "or" between them, no wrapping inside a keycap).

#### Scenario: New shortcut
- **WHEN** a change adds a registry entry for "Toggle density" with `Shift+D`
- **THEN** the cheat sheet, the regenerated keyboard guide and the palette's "Toggle density" command all show `Shift+D` without further edits

#### Scenario: Guide keycaps
- **WHEN** the user opens Help → Keyboard shortcuts on a phone
- **THEN** `g then t` reads as two keycaps and no keycap is split across lines

### Requirement: Sequence spotlight
When the user presses the first key of a registered sequence outside a text field and no second key follows within 250 ms, the client SHALL open a small dialog in the centre of the screen. The dialog SHALL show the pressed key as a keycap followed by "+", the instruction "Press a key", and the sequences that can complete in the scopes active right now, each as its second key and its short label, grouped. While the dialog is open, the pending sequence SHALL NOT expire. Pressing a listed key, or clicking a listed entry, SHALL run that shortcut and close the dialog. Esc, the dialog's close button, a click outside it, or a key that completes no sequence SHALL close it without running anything and return focus to where it was. A second key pressed within 250 ms SHALL run its shortcut without the dialog ever showing.

#### Scenario: Hesitating after g
- **WHEN** the user presses `g` on the Today view and waits half a second
- **THEN** a dialog in the centre of the screen shows "g +", "Press a key" and, among others, "t Today", "i Inbox" and "u Upcoming"

#### Scenario: Completing from the spotlight
- **WHEN** the spotlight for `g` is open and the user presses `u`, even three seconds after `g`
- **THEN** Upcoming opens and the spotlight closes

#### Scenario: Cancelling with Esc
- **WHEN** the spotlight is open over a list with the task panel open and the user presses Esc
- **THEN** the spotlight closes, the task panel stays open, nothing else runs, and focus returns to where it was before `g`

#### Scenario: Cancelling with the mouse
- **WHEN** the spotlight is open and the user clicks its close button or anywhere outside it
- **THEN** it closes and no shortcut runs

#### Scenario: Fluent typing never shows it
- **WHEN** the user types `g` and `t` 150 ms apart
- **THEN** Today opens and no spotlight is shown at any moment

#### Scenario: A key that completes nothing
- **WHEN** the spotlight for `g` is open and the user presses `z`, which completes no sequence
- **THEN** the spotlight closes and nothing else happens

#### Scenario: Only what is available
- **WHEN** the assistant is turned off on the server and the user hesitates after `g`
- **THEN** the spotlight does not list `k` (Ask)

#### Scenario: Vim's gg
- **WHEN** Vim keybindings are on and the user hesitates after `g` in a list
- **THEN** the spotlight lists "g First task" with the go-to entries, and pressing `g` selects the first task

#### Scenario: Not while typing
- **WHEN** focus is in the quick add field and the user types `g`
- **THEN** the letter is typed and no spotlight opens
