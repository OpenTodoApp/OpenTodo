## MODIFIED Requirements

### Requirement: Task panel layout
The task page SHALL show, top to bottom: a compact header with the breadcrumb (the list the task was opened from as a link back to it, the task's project, its parent task when it has one, and the task), the task's place in the list it was opened from ("4 / 12") with the next and previous task, a menu holding Delete, Copy link, Attach and the less frequent actions, and Close; then the content column with the task's checkbox and editable title, the notes (never clamped), an Attach control, the project's custom fields, the subtasks as one bordered block with their count and progress, the attachments list only when there are attachments, and the tabbed area with Comments, Activity, History and Time, the comment composer pinned to the bottom; and the facts column beside the content from 1024 px, under the notes below that. The docked panel of a page that keeps a split SHALL keep the earlier panel layout: the sticky header with the checkbox, the title, the menu (with Expand) and Close, the clamped notes, the facet lines with Add, the subtasks, the attachments and the tabs.

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
