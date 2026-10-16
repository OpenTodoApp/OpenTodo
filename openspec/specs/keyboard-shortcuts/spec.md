# keyboard-shortcuts Specification

## Purpose
Defines how keyboard shortcuts are registered, scoped, resolved and shown to the user: one registry that drives the cheat sheet, the keyboard guide, tooltips and the palette, so shortcuts never conflict and are discovered where the action is.

## Requirements

### Requirement: One shortcut registry with scopes
Every keyboard shortcut SHALL be declared once in a registry entry with its keys, its action, a description, a section and a scope: `global`, `view` (one named view), `list` (a task list has focus or a row is selected), `panel` (the task panel), `board`, `calendar`, `editor` (notes or comment composer) or `vim`. One dispatcher SHALL resolve a key press to the innermost active scope. No shortcut SHALL be handled outside the dispatcher.

#### Scenario: Innermost scope wins
- **WHEN** the task panel has focus and the user presses `1`
- **THEN** the panel's priority action runs, not the list's, and only once

#### Scenario: Scope not active
- **WHEN** no task list is on screen and the user presses `c`
- **THEN** nothing happens and no error is logged

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
`?` SHALL open a cheat sheet dialog that lists, first, the shortcuts of the scopes active right now, then "Everywhere" and "Go to", then the remaining sections, each as a titled group in two columns from 768 px. It SHALL have a search field that filters by key or description, SHALL be at most 80 % of the viewport height with its own scroller, and SHALL render from the registry.

#### Scenario: Context first
- **WHEN** the user presses `?` while a board is shown
- **THEN** the first group is "Board", followed by "Tasks in a list", "Everywhere" and "Go to"

#### Scenario: Search the sheet
- **WHEN** the sheet is open and the user types "dead"
- **THEN** only the deadline shortcuts remain, across every group

#### Scenario: Fits the screen
- **WHEN** the sheet opens on a 1280×800 screen
- **THEN** its header, search field and close button are visible, and its content scrolls inside the dialog

### Requirement: Shortcut hints live in tooltips and menus
Shortcut hints SHALL be shown in the tooltip of the control that runs the action, beside the item in menus and the palette, and in the cheat sheet. No key badge SHALL be printed in the chrome (headers, inputs, subtitles, prompts) unless the "Show shortcut hints" preference is on. The guide text that names a key SHALL name the action first.

#### Scenario: Hover the Share action
- **WHEN** the user hovers or focuses the Share action of a project
- **THEN** its tooltip reads "Share project · Shift+S", and no key badge is printed next to the action

#### Scenario: Hints preference
- **WHEN** the user turns on "Show shortcut hints" in Settings → General → Keyboard
- **THEN** quick add shows its `q` badge again and section headers show their keys, on this device only

### Requirement: Registry drives the guide and the palette
The keyboard guide in the documentation and the shortcut column of the command palette SHALL be generated from the registry, grouped by section, so the three never disagree.

#### Scenario: New shortcut
- **WHEN** a change adds a registry entry for "Toggle density" with `Shift+D`
- **THEN** the cheat sheet, the regenerated keyboard guide and the palette's "Toggle density" command all show `Shift+D` without further edits
