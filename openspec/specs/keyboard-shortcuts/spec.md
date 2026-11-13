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
The keyboard guide in the documentation and the shortcut column of the command palette SHALL be generated from the registry, grouped by section, so the three never disagree. The guide SHALL render keys with the same keycap rules as the cheat sheet (one keycap per chord, "then" and "or" between them, no wrapping inside a keycap), and the palette SHALL render a command's keys as keycaps at the right of its row with the same "then" between the steps of a sequence. The keys that work only inside the palette's Add mode (Shift+Enter to add and open, `↓` and `↑` to move over the field rows, Tab to edit the highlighted row) SHALL be registry entries local to the palette, listed in the cheat sheet and the guide.

#### Scenario: New shortcut
- **WHEN** a change adds a registry entry for "Toggle density" with `Shift+D`
- **THEN** the cheat sheet, the regenerated keyboard guide and the palette's "Toggle density" command all show `Shift+D` without further edits

#### Scenario: Guide keycaps
- **WHEN** the user opens Help → Keyboard shortcuts on a phone
- **THEN** `g then t` reads as two keycaps and no keycap is split across lines

#### Scenario: Palette keycaps
- **WHEN** the user types "today" in the command palette
- **THEN** "Go to Today" shows the keycaps `G` then `T` at the right of its row

#### Scenario: Add mode keys are listed
- **WHEN** the user opens the cheat sheet and searches for "add and open"
- **THEN** a row lists `Shift+Enter` for adding the task from the command bar's Add mode and opening it

### Requirement: Sequence spotlight
When the user presses the first key of a registered sequence outside a text field and no second key follows within 250 ms, the client SHALL open a small dialog in the centre of the screen. The dialog SHALL show the pressed key as a keycap followed by "+", the instruction "Press a key", and the sequences that can complete in the scopes active right now, each as its second key and its short label, grouped. For a sequence of three keys the dialog SHALL list its next key with the name of that step ("g Group by"), and after that key it SHALL show both pressed keys and the choices that can complete it. While the dialog is open, the pending sequence SHALL NOT expire. Pressing a listed key, or clicking a listed entry, SHALL run that shortcut, or continue the sequence for a step, and close the dialog once a shortcut runs. Esc, the dialog's close button, a click outside it, or a key that completes no sequence SHALL close it without running anything and return focus to where it was. A second key pressed within 250 ms SHALL run its shortcut without the dialog ever showing.

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

#### Scenario: Three keys
- **WHEN** the user presses `r` in a project's list and waits
- **THEN** the spotlight lists "g Group by", "o Order by" and "r Reverse order"; after `g` it shows "r g +" and lists Section, None, Due date, Priority and Label, and not Project

### Requirement: Key sequences in tooltips
A tooltip that shows a shortcut SHALL show a key sequence as its steps joined by a translated "then" ("G then T"), each step as its own key badge in upper case, and a chord or single key as one badge. Every sidebar destination that has a `g` sequence SHALL name it in its tooltip ("Go to Today · G then T") with a fine pointer, read from the shortcut registry, so the tooltip and the registry can never disagree; the sequence is not printed in the row itself unless the user turned on shortcut hints.

#### Scenario: Hovering Upcoming
- **WHEN** the user rests the pointer on Upcoming in the sidebar on a desktop
- **THEN** a tooltip reads "Go to Upcoming · G then U", with G and U as key badges

#### Scenario: Registry change
- **WHEN** a contributor changes the shortcut of Go to Upcoming in the registry to `g w`
- **THEN** the tooltip reads "Go to Upcoming · G then W" without any other change

#### Scenario: A chord stays one key
- **WHEN** a tooltip shows the shortcut Ctrl+K
- **THEN** it shows one badge reading "Ctrl+K", without "then"

### Requirement: Group and order keys
In a project's list (List layout), on a label's page, in a saved view, and on Today, Upcoming and the Inbox, the client SHALL offer key sequences that change the list's Display options: `r g` followed by `s` (Section), `j` (Project), `n` (None), `d` (Due date), `p` (Priority), `l` (Label) or `t` (Time of day) SHALL set Group by; `r o` followed by `m` (Manual order), `p` (Priority), `d` (Due date), `c` (Created), `l` (Deadline) or `t` (Title) SHALL set Order by; `r r` SHALL switch the direction between ascending and descending. A sequence SHALL work only where the page's panel offers that choice and SHALL do nothing elsewhere, including the New view page and a project's board, timeline and calendar layouts: `r g` does nothing on Upcoming, `r g t` works only on Today, and `r o m` does nothing on Today and Upcoming. The keys SHALL write the same setting as the panel, through the same operations, so the change works offline, reaches the user's other devices with sync and converges by last-writer-wins per field. After each sequence the client SHALL show a notice with the setting now in effect, in the panel's words, in a live region read by screen readers. The keys SHALL NOT fire while a text field has focus, SHALL NOT fire while single-key shortcuts are turned off, and SHALL keep working with Vim keybindings on. The `?` sheet and the keyboard guide SHALL list them under "Group and order", generated from the registry.

#### Scenario: Group a project by priority
- **WHEN** the user presses `r`, `g`, `p` in the list of the project "Home"
- **THEN** the list is grouped by priority, the notice reads "Group by: Priority", and the project's stored grouping is Priority, as if chosen in the panel

#### Scenario: Order, then reverse
- **WHEN** the user presses `r o p` and then `r r` in a saved view, before the list has redrawn
- **THEN** the view is ordered by priority, descending, with priority 1 first, and the notice reads "Order by: Priority · Descending (p1 first)"

#### Scenario: A choice the page does not offer
- **WHEN** the user presses `r g s` on a label's page
- **THEN** nothing changes and nothing is announced, and `r g j` groups the page by project

#### Scenario: Offline
- **WHEN** the device is offline and the user presses `r g d` in a project
- **THEN** the list is grouped by due date at once, the change is queued, and the user's other devices show the same grouping after they sync

#### Scenario: While typing
- **WHEN** focus is in the quick add field and the user types `rgp`
- **THEN** the letters are typed and the grouping is unchanged

#### Scenario: With Vim keybindings
- **WHEN** Vim keybindings are on and the user presses `r o d` in a project
- **THEN** the list is ordered by due date, and no quick add opens and nothing is deleted

#### Scenario: Elsewhere
- **WHEN** the user presses `r g p` on the New view page or on a project's board
- **THEN** nothing happens

#### Scenario: Today
- **WHEN** the user presses `r g p` on Today and then `r g t`
- **THEN** Today is grouped by priority with the notice "Group by: Priority", then back by time of day with the notice "Group by: Time of day"

#### Scenario: Upcoming has no grouping
- **WHEN** the user presses `r g p` on Upcoming
- **THEN** nothing happens, and `r o p` orders each day by priority

### Requirement: Single-key shortcuts can be turned off
The client SHALL offer a per-device switch "Single-key shortcuts" in Settings → General → Keyboard, on by default. While it is off, no shortcut whose first key is a single letter, number, punctuation or symbol character pressed without Ctrl, Alt or ⌘ SHALL run, including the sequences that start with one (`g` then a key); shortcuts with Ctrl, Alt or ⌘ and the named keys (arrows, Enter, Escape, Tab, Delete, the function keys, Space) SHALL keep working, and typing in a text field is unaffected either way (WCAG 2.2 2.1.4 Character Key Shortcuts).

#### Scenario: Speech input does not run commands
- **WHEN** a person who uses speech input turns Single-key shortcuts off and says "quick" while the Today list has focus
- **THEN** no quick add opens and nothing else runs, and Ctrl+K still opens search

#### Scenario: On by default
- **WHEN** a new device opens the app
- **THEN** pressing `q` opens the quick add

### Requirement: Go keys choose the sidebar space
The go sequences SHALL show the sidebar space of the screen they open (`app-shell` "Sidebar spaces"): `g e` SHALL open Notes and show the Notes space, and every `g` sequence that opens a task screen (Inbox, Today, Upcoming, the calendar, a method view, Labels, Views, All projects and the others) SHALL show the Tasks space; `g s`, `g ?` and the other sequences that open a neutral screen SHALL keep the space as it was. No key SHALL be added or moved for the spaces: `g n` stays Go to Anytime. The `?` sheet and the keyboard guide SHALL describe `g e` as opening Notes with the Notes sidebar, generated from the registry. The space is device state, so the keys work offline and nothing is sent or converged.

#### Scenario: Into notes and back
- **WHEN** the user in Today presses `g e`, then `g t`
- **THEN** Notes opens with the Notes space in the sidebar, then Today opens with the Tasks space

#### Scenario: Settings in between
- **WHEN** the user in the Notes space presses `g s`
- **THEN** Settings opens and the sidebar still shows the Notes space

#### Scenario: Anytime keeps its key
- **WHEN** the user presses `g n`
- **THEN** Anytime opens with the Tasks space, as before this change
