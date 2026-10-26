## MODIFIED Requirements

### Requirement: Task panel layout
The task page SHALL show, top to bottom: a compact header with the breadcrumb (the list the task was opened from as a link back to it, the task's project, its parent task when it has one, and the task), the task's place in the list it was opened from ("4 / 12") with the next and previous task, a menu holding Delete, Copy link, Attach and the less frequent actions, and Close; then the content column with the task's checkbox and editable title, the notes (never clamped), an Attach control, the project's custom fields, the subtasks as one bordered block with their count and progress, the attachments list only when there are attachments, and the tabbed area with Comments, Activity, History and Time, the comment composer pinned to the bottom; and the facts column beside the content from 1024 px, above the notes below that. The docked panel of a page that keeps a split SHALL keep the earlier panel layout: the sticky header with the checkbox, the title, the menu (with Expand) and Close, the facet lines with Add, the custom fields, the subtasks, the attachments, the notes in full and the tabs.

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu on the task page and chooses Delete
- **THEN** the task moves to the Trash, the page returns to the list it was opened from, and a toast offers Undo

#### Scenario: Scrolled panel keeps its context
- **WHEN** the user scrolls the task page down to the comments
- **THEN** the header with the breadcrumb, the place in the list and Close stays visible, and on a wide screen so does the facts column

#### Scenario: Long title
- **WHEN** the user opens a task whose title is wider than the content column
- **THEN** the title wraps under the checkbox and remains editable in place, and the breadcrumb shortens its last crumb with an ellipsis

#### Scenario: Back to the list from the breadcrumb
- **WHEN** the user opens a task of the project "Home" from Today on a wide screen and activates the first crumb, "Today"
- **THEN** Today shows with that task selected at the same scroll position, as with Esc or Close

#### Scenario: Opened from its own project
- **WHEN** the user opens a task from its project "Home"
- **THEN** the breadcrumb starts with "Home", once, and activating it returns to the project with the task selected

#### Scenario: No list to return to
- **WHEN** the user opens a link to a task that has no project
- **THEN** the breadcrumb starts with "Inbox" as a link, which opens the Inbox with the task selected

#### Scenario: Properties first in the panel
- **WHEN** the user opens, in the docked panel, a task with a forty-line note, two subtasks and an attachment
- **THEN** the panel body shows, top to bottom, the facet lines, the subtasks, the attachments, the whole note and the tabs, and the facet lines are at the same height as for a task without notes

#### Scenario: Facts above the notes on a narrow task page
- **WHEN** the user opens a task as a page at 768 px wide
- **THEN** the facts card is shown between the title and the notes

## ADDED Requirements

### Requirement: Task panel notes in full
In the docked panel the notes SHALL be shown in full at rest, with no clamp, fade or "Show all" control, as on the task page. Long notes SHALL grow inside the panel's one scrolling body and SHALL NOT get a scroll region of their own, so the screen keeps its scroll-region budget. Opening another task SHALL show its notes in full too; nothing about the notes is remembered per task.

#### Scenario: Long note in the panel
- **WHEN** the user opens a task whose notes are forty lines long on a 1280×800 screen
- **THEN** the facet lines are in view at the top of the panel body, the whole note follows the attachments without a "Show all" control, and scrolling the panel body reaches the end of the note and then the tabs

#### Scenario: No extra scroll region
- **WHEN** the project screen shows the list with the panel open on a task with a two-hundred-line note
- **THEN** the screen has at most three vertical scroll regions (the sidebar, the list and the panel body) and the note itself does not scroll

#### Scenario: Next task
- **WHEN** the user reads a long note in the panel and presses `j`
- **THEN** the next task's facet lines are at the top of the panel body and its note is shown in full

## REMOVED Requirements

### Requirement: Task panel notes clamp
**Reason**: Issue #444. With the notes below the properties, clamping them no longer keeps anything in view, and Show all cost a click on every task. Replaced by "Task panel notes in full".
**Migration**: None. Notes show in full; no data or setting changes.
