# Spec Delta

## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show a panel in the shell's panel slot (see `app-shell`) for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The panel SHALL show only the properties that have a value, grouped into facet lines, and offer the rest from an Add menu. On narrow screens the panel SHALL open as a full-screen sheet over the list.

#### Scenario: Open from the list
- **WHEN** the user clicks a task's title or presses Enter on a selected task
- **THEN** the detail panel opens with that task's fields and the address carries the task id

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the panel shows the title, the notes placeholder, the Where line (the project), the When line reading "Not scheduled", the How line reading "P4", the subtask line and the Add menu, and no other property

### Requirement: Task panel layout
The panel SHALL show, top to bottom: a sticky header with the task's checkbox, the editable title wrapping to at most two lines, a menu holding Delete, Copy link, Expand, Attach and the less frequent actions, and Close; the notes (a single placeholder line until focused, the editor otherwise, clamped at rest when long); the facet lines and the Add control; the subtasks as a checklist with its count; the attachments list only when there are attachments; and the tabbed area with Comments, Activity and History.

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu and chooses Delete
- **THEN** the task moves to the Trash, the panel closes and a toast offers Undo

#### Scenario: Scrolled panel keeps its context
- **WHEN** the user scrolls the panel down to the comments
- **THEN** the checkbox and title stay visible at the top of the panel

#### Scenario: Long title
- **WHEN** the user opens a task whose title is wider than the panel
- **THEN** the title wraps onto a second line in the header and remains editable in place, and no subtask count is shown in the header

### Requirement: Task panel comment composer
The comment composer SHALL be pinned to the bottom of the panel while Comments is shown, resting as a single line that expands to the full composer (attach, submit, the submit key hint) when focused, when it holds a draft or a reply target, or when `Shift+C` is pressed; `Shift+C` SHALL switch to Comments and focus the composer.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown, the composer is expanded and has focus

#### Scenario: Composer without scrolling
- **WHEN** a task with thirty comments is opened
- **THEN** the composer line is visible at the bottom of the panel before the user scrolls

#### Scenario: At rest
- **WHEN** a task without a draft is opened and nothing is focused
- **THEN** the composer is one line reading "Write a comment…" with no buttons under it, and the Comments list has the space the full composer used

## REMOVED Requirements

### Requirement: Task panel property chips
**Reason**: The wrapping row of same-shaped chips does not scale past a handful of properties: three dates in three formats, clear buttons between values and inline editors that push the panel. Replaced by facet lines with popover editors.
**Migration**: Every chip becomes a part of one of the four facet lines ("Task panel facets"); each part writes the same operation its chip wrote, and the Add menu keeps its entries and shortcuts, grouped by facet ("Add menu grouped by facet"). List-row shortcuts that opened a chip's editor open the same editor as a popover.

## ADDED Requirements

### Requirement: Task panel facets
The panel SHALL group the task's properties into four facet lines, each with a leading icon and parts separated by a middle dot: Where (project › section, the parent task, the origin), When (do on, repeat, deadline, start, evening, reminders, zone), How (priority, estimate, labels) and Who (assignee, blocked by, blocks). Where, When and How SHALL always be shown; Who SHALL be shown when any of its parts has a value. A part SHALL read with the words the list row uses for the same fact.

#### Scenario: Full task reads as four lines
- **WHEN** the user opens a task due tomorrow at 09:00 that repeats every 3 months, has a deadline in 9 days, a start two days ago, two reminders, priority 2, a 2 h estimate, three labels, is assigned to the user and waits for "Collect the numbers", in "Website launch › Doing"
- **THEN** the panel shows exactly four facet lines: "Website launch › Doing"; "Tomorrow 09:00 · every 3 months · deadline Sun 25 Oct, 9 days · since Wed 14 Oct · 2 reminders"; "P2 · 2 h" followed by the three label chips; "You · waits for Collect the numbers"

#### Scenario: Facet without values is hidden
- **WHEN** a task has no assignee, no blockers and nothing waits for it
- **THEN** no Who line is shown, and "Assignee" and "Blocked by" are offered in the Add menu

#### Scenario: Same words as the row
- **WHEN** a task is due today, repeats every day and is marked for the evening
- **THEN** its When line starts "Today · evening · every day", in the date tone the row uses

#### Scenario: Origin opens its source
- **WHEN** the user presses Enter on the origin part of a task captured from `https://example.org/post`
- **THEN** the page opens in a new tab, no editor opens, the panel stays as it was, and Remove origin in the panel's header menu clears the origin as one offline-capable write

#### Scenario: Viewer reads the lines
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the facet lines render as text, no part opens an editor, and the Add menu is absent

### Requirement: Facet editors are popovers
Activating a part SHALL open its editor as a popover anchored to the part from 640 px and as a bottom sheet below, with the facet's name and icon as its title and a footer offering Clear (when the part has a value) and Done. The panel's content SHALL not move while a popover is open. Done, Escape or a committed single-value edit SHALL close the popover and return focus to the part; Clear SHALL remove the value and close it.

#### Scenario: Clear from the footer
- **WHEN** the user opens the deadline part and chooses Clear
- **THEN** the deadline is removed, the popover closes, the When line no longer reads a deadline, and no "×" control is rendered on any line

#### Scenario: Layout stays
- **WHEN** the user opens the Do on part on a 1280×800 screen
- **THEN** the subtasks and the tabs keep their position in the panel while the popover is open

#### Scenario: Phone sheet
- **WHEN** the user taps the labels part on a 390 px wide screen
- **THEN** the labels editor opens as a bottom sheet with the facet's title and Done, and closing it returns to the panel scrolled where it was

### Requirement: When popover shows one segment
The When popover SHALL offer the segments Do on, Start, Deadline, Repeat and Reminders in a segmented control and show one at a time, starting on the segment of the part that opened it (Do on when opened from the Add menu or a shortcut that names no part). The Do on segment SHALL hold the date, the time, the Evening toggle and the zone control.

#### Scenario: Open on the clicked part
- **WHEN** the user activates the "2 reminders" part
- **THEN** the When popover opens on its Reminders segment with the first reminder control focused, and switching to Deadline shows only the deadline field

#### Scenario: Shortcut from the list
- **WHEN** a task is selected in a list and the user presses the deadline shortcut
- **THEN** the panel opens with the When popover on its Deadline segment and the date field focused

### Requirement: Add menu grouped by facet
The Add control SHALL list the properties that have no value under the headings Where, When, How and Who, each with its shortcut, omitting a heading with nothing under it. Picking an entry SHALL add the part to its facet line with its editor open and focused; closing the editor without a value SHALL remove the part again and focus the Add control.

#### Scenario: Add an estimate
- **WHEN** the user opens Add, picks Estimate under How, types `1h30` and presses Enter
- **THEN** the How line reads "P4 · 1 h 30" and focus is on the new part

#### Scenario: Cancel leaves no trace
- **WHEN** the user picks Deadline from Add and presses Escape without a date
- **THEN** the When line is unchanged and focus is on the Add control

### Requirement: Facet keyboard operation
Each part SHALL be in the tab order; Enter or Space SHALL open its editor; `1` to `4` SHALL keep setting the priority while focus is in the panel outside a text field. Viewers' parts SHALL not be focusable as controls.

#### Scenario: Move between parts
- **WHEN** the user tabs to the first part of the When line and presses Tab, then Enter
- **THEN** focus moves to the next part of the same line and its editor opens; Escape closes it with focus back on that part

### Requirement: Task panel notes clamp
In the panel, notes that are not focused SHALL be clamped to about eight lines with a "Show all" control when they are longer; focusing the notes or choosing Show all SHALL expand them for the rest of the time the task is open. The task page SHALL never clamp.

#### Scenario: Long note in the panel
- **WHEN** the user opens a task whose notes are forty lines long on a 1280×800 screen
- **THEN** the panel shows the first lines of the notes, a "Show all" line, and the facet lines below it without scrolling

#### Scenario: Editing expands
- **WHEN** the user clicks into the clamped notes
- **THEN** the whole note is shown and stays shown after the editor loses focus, until another task is opened
