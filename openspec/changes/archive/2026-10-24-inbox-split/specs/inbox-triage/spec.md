## MODIFIED Requirements

### Requirement: Entering and leaving the triage mode
The client SHALL offer a triage mode for the Inbox, entered with `g` then `p` from anywhere, with `P` on the Inbox, with the Inbox header's primary action "Process" (showing its key `P`), and with the Vim command `triage`. While the Inbox has open Inbox tasks its header meta SHALL say how many are left to sort ("4 to sort"). The mode SHALL show one open Inbox task at a time: its title, its notes read-only, and its due date, labels and reminders if any. Escape SHALL return to the Inbox with the current task selected. When the Inbox has no Inbox task the mode SHALL show the Inbox zero state: the Inbox zero illustration (OpenSpec `design-system`, "Illustrations") above the text "Inbox zero: every task has a place." and the way back. The Process control, the header's count and the mode SHALL count Inbox tasks as OpenSpec `project-organization` defines them.

#### Scenario: Enter with the chord
- **WHEN** focus is not in a text field and the user presses `g` then `p`
- **THEN** the triage mode opens on the first open Inbox task, showing its title and notes

#### Scenario: Enter with P on the Inbox
- **WHEN** the Inbox holds four tasks, focus is not in a text field, and the user presses `P`
- **THEN** the triage mode opens on the first of them; the header had shown "4 to sort" and a primary "Process" button with the key `P`

#### Scenario: Leave with Escape
- **WHEN** the user is on the fourth task and presses Escape
- **THEN** the Inbox list opens with that task selected

#### Scenario: Empty Inbox
- **WHEN** the mode is opened with no open task in the Inbox
- **THEN** it shows the Inbox zero illustration and text with a control that returns to the Inbox, and no decision key does anything

## ADDED Requirements

### Requirement: Inbox list and detail
From 1024 px of screen width the Inbox SHALL keep a detail pane beside its list, in the shell's panel slot, about half the content's width (at least 26 rem, at most 44 rem). The task under the list's cursor SHALL show in the pane, as the docked task of `web-app` "Task page" shows it, and SHALL follow the cursor: `j`, `k`, the arrow keys and a click on a row move the cursor and the pane shows that task. A click on a task's title SHALL show it in the pane instead of editing it in place. Enter on the cursor's row SHALL open the task as its page (`web-app` "Task page"), whose Back returns to the Inbox. Escape, the pane's Close and a click on the empty part of the list SHALL clear the cursor and empty the pane. While rows are ticked for a bulk action the pane SHALL stay empty, since ticking opens nothing; when the ticks clear, the cursor's task SHALL show again. With no task under the cursor the pane SHALL read "No task selected" with one sentence naming the ways on: select a task, or press `P` to process them, one at a time. An Inbox with no task SHALL show its empty state and no pane. Below 1024 px the Inbox SHALL be a plain list whose tasks open as their page. The pane SHALL only read and edit the task through the same operations as the task page, so it works offline and converges like any edit.

#### Scenario: The pane follows the cursor
- **WHEN** the Inbox holds "Book the dentist" and "Ideas for Mia's birthday" on a 1440 px screen and the user presses `j`, then `j` again
- **THEN** the pane shows "Book the dentist", then "Ideas for Mia's birthday", and focus stays on the list

#### Scenario: No task selected
- **WHEN** the user opens the Inbox with four tasks and nothing selected
- **THEN** the pane reads "No task selected" and "Select a task to decide where it goes, or press P to process all 4, one at a time."

#### Scenario: Enter opens the page
- **WHEN** the pane shows "Book the dentist" and the user presses Enter
- **THEN** the task opens at `/task/<id>` with "2 / 4", and Escape returns to the Inbox with that row selected

#### Scenario: Escape empties the pane
- **WHEN** the pane shows a task and the user presses Escape on the list
- **THEN** no row is selected and the pane reads "No task selected"

#### Scenario: Ticking opens nothing
- **WHEN** the pane shows a task and the user ticks it and the next row with `x` and Shift+Down
- **THEN** the pane reads "No task selected" while the two rows are ticked, and shows the cursor's task again after Escape clears the ticks

#### Scenario: Narrow screen
- **WHEN** the user presses Enter on a selected Inbox task in a 900 px wide window
- **THEN** the task opens as its page, and no pane is shown beside the Inbox

### Requirement: Inbox source lines
Each top-level task row of the Inbox SHALL carry a second line under its title, at the metadata size in the muted colour with an icon for its kind, saying where the task came from and when it was added: the source, a middle dot, and the time since its creation ("5 min ago", "2 h ago", "3 d ago", its date after a week). The source SHALL be read on the device from the task's origin when it has one ("From email", "From email (Gmail)" for a message opened in a web mail client, "From example.org" for a page, the issue's id such as "From acme/app#12", "Imported from todoist"), else from the device that wrote the task's creation ("From a calendar app" for a CalDAV app, "Added by an AI assistant" for an MCP agent or the in-app assistant, "Added through the API", "From a Markdown vault", "Imported"), else "Added". The line SHALL take the place of the origin item on Inbox rows; the task page and the docked task SHALL still show the origin with its link. Nothing SHALL be requested or written to show it, so it reads the same offline and on every device once the task has synced.

#### Scenario: A mail
- **WHEN** a task was created from an email to the Inbox address three days ago
- **THEN** its Inbox row reads "From email · 3 d ago" under the title, with the mail icon, and no origin item at the row's end

#### Scenario: A calendar app
- **WHEN** a task was created two hours ago in a calendar app through CalDAV
- **THEN** its Inbox row reads "From a calendar app · 2 h ago"

#### Scenario: Made in the app
- **WHEN** a task was typed into the Inbox's quick add five minutes ago
- **THEN** its row reads "Added · 5 min ago"
