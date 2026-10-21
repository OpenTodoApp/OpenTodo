# task-list-presentation Specification

## Purpose
Defines how a task reads in every list and board: one row anatomy, one metadata language, one group header, how empty groups behave, density, and the feedback a user gets when completing or undoing an action.

## Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the title, a metadata line shown only when there is metadata, and a trailing group at the end of the row for the counts (subtask progress, comments, attachments, the notes marker) shown only when there is a count. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views. The trailing group SHALL be in the page and read by assistive technology at all times; with Calm rows it is at low contrast (still meeting text contrast) until the pointer is over the row or focus is inside it, then at full contrast; with Detailed rows the counts stay in the metadata line as before. The trailing group is not a control and SHALL NOT add a touch or tab target.

#### Scenario: Same alignment across views
- **WHEN** the user moves between Today, the Inbox and a project without sections
- **THEN** the checkboxes of top-level tasks are at the same horizontal position in all three

#### Scenario: Single-line rows
- **WHEN** a task has no date, labels, estimate, subtasks, comments or attachments
- **THEN** its row is one line tall

#### Scenario: Counts on demand
- **WHEN** Calm rows are on and a task has 2 of 3 subtasks done and 3 comments
- **THEN** "2/3" and "3" are at the end of the row in the faint text colour, become the muted text colour while the pointer is over the row or its open control has focus, and a screen reader hears "2 of 3 subtasks completed" and "3 comments" either way

#### Scenario: Counts on a touch screen
- **WHEN** Calm rows are on and the same row is shown on a device without hover
- **THEN** the counts are shown at low contrast, still readable, and no extra tap target exists

### Requirement: Metadata language
Row metadata SHALL use three styles only: tone text for the date and the deadline (the deadline with its icon), label chips, and neutral chips for estimate (reading `tracked / estimate` once time was tracked, or `tracked` alone without an estimate), subtask progress, comment count, attachment count, project and origin. The origin chip SHALL show an icon for the kind from the app's icon set (a link for `url` and `issue`, an at sign for `email`, a download arrow for `import`) and the external id, else the URL's host; when the origin has a URL the chip SHALL be a link that opens it in a new tab without passing the referrer, and activating it SHALL not open the task. Counts SHALL use tabular figures, not a monospace face. The project SHALL not be shown in the Inbox or inside that project's view.

With **Detailed** rows the language is unchanged from before this change: the priority ring is coloured for every priority, the date is in its tone (danger overdue, success today, violet soon, muted later), repeat and evening are suffixes of the date text, every label is a chip, and the counts are in the line.

With **Calm** rows (the default):

- **Colour.** The priority ring is coloured for P1 and P2 only; P3 and P4 use the neutral input border. The date is in the muted text colour, except overdue (danger) and a timed task due today (accent). Evening stays a suffix of the date. Repeat is a muted repeat icon followed by the word "repeats" (an occurrence: "occurrence"), after the date, never icon-only. The deadline keeps its hourglass and its neutral, warning and danger tones. Label colour appears only as dots. Every colour is a token.
- **Labels.** One row of small dots, one per label in the task's label order, then the first label's name, then "+n" for the remaining labels. The full names in order SHALL be read by assistive technology, shown in a tooltip while the pointer is over the group or it has keyboard focus, and in the task panel as before.
- **What the view implies is left out**, by this table; everything else is shown when set:

| View or group | Left out of the row (Calm) | Kept |
| --- | --- | --- |
| Inbox | the project chip | everything else |
| Today, today's group | the date word "Today" | the due time, "evening" and the repeat mark |
| Today, This Evening group | "Today" and "evening" | the due time, the repeat mark |
| Today, Overdue and Blocked groups | nothing | the date, so how late it is stays visible |
| Upcoming, a date group | the date words of that day | the due time, "evening", the repeat mark, the deadline |
| A project, list layout | the project chip | the section is not on rows anyway |
| A project, board | the project chip and the section (the column says it) | the rest, including the field badges |
| A project, Later group | nothing | "Starts" and "Someday" chips |
| A label's view | the chip of that label | other labels, the date, counts |
| Someday | the "Someday" chip | the project chip |
| A saved view grouped by project | the project chip | everything else |
| Anytime, Assigned, Completed, filters, dashboards, Next, Waiting, the review and Loop screens, Trash | nothing | everything |

A row SHALL never omit a value because of what it is; only because the heading or the view already states it. The omission is presentation only: nothing is written, and the same task shows the same row on every device with the same preference.

#### Scenario: Recurring evening task
- **WHEN** Calm rows are on, a task is due today, repeats every day and is marked for the evening, and Today shows it under This Evening
- **THEN** its metadata shows no date text and a muted repeat icon with "repeats", and in Detailed rows the same task reads "Today · evening · repeats" in the date tone with no separate icons

#### Scenario: Timed task in Today
- **WHEN** Calm rows are on and a task is due today at 10:00
- **THEN** its Today row shows "10:00" in the accent colour and no "Today", while the same task in its project reads "Today 10:00" in the accent colour

#### Scenario: Overdue stays loud
- **WHEN** Calm rows are on and a task was due three days ago
- **THEN** its row in Today's Overdue group and in its project shows the date in the danger colour

#### Scenario: Neutral ring for P3 and P4
- **WHEN** Calm rows are on and a list holds a P1, a P2, a P3 and a P4 task
- **THEN** the P1 and P2 circles carry their priority colours and the P3 and P4 circles carry the neutral ring, while Detailed rows colour all four

#### Scenario: Three labels on a row
- **WHEN** Calm rows are on and a task carries the labels errand, call and home, in that order
- **THEN** the row shows three colour dots, "errand" and "+2", a screen reader hears "Labels: errand, call, home", and hovering or focusing the group shows all three names

#### Scenario: Inside the label's view
- **WHEN** Calm rows are on and the errand label's view lists that task
- **THEN** the row shows the dots and names of call and home only, and the errand chip returns in Detailed rows

#### Scenario: Inbox rows
- **WHEN** the Inbox is shown
- **THEN** no row carries an "Inbox" chip, in either detail

#### Scenario: Board card inside its project
- **WHEN** Calm rows are on and a project board shows a card with a section, a project, two labels and a deadline
- **THEN** the card shows no project chip and no section, and shows the label dots and the deadline

#### Scenario: Upcoming under Tomorrow
- **WHEN** Calm rows are on and Upcoming lists a task due tomorrow at 09:30 under the Tomorrow heading
- **THEN** the row shows "09:30" and not "Tomorrow", and a task due tomorrow without a time shows no date text under that heading

#### Scenario: Issue chip opens the issue
- **WHEN** a task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` and the user clicks its chip
- **THEN** the issue opens in a new tab, the task panel does not open, and the chip's accessible name says it opens the source "o/r#7"

#### Scenario: Captured page on a card
- **WHEN** a task captured from `https://example.org/post` with title "Interesting article" is shown on the board
- **THEN** the card's metadata carries a link chip reading "example.org", and a task without an origin carries no origin chip

#### Scenario: Email origin without a link
- **WHEN** a task's origin is `{kind: "email", id: "<a1@mail.example>"}`
- **THEN** its chip shows the at sign and reads "Email", is not a link, and the Message-ID is not shown

#### Scenario: Tracked time stays one chip
- **WHEN** a task estimated at one hour has 35 minutes tracked
- **THEN** its row carries one neutral chip reading `35m / 1h`, no second chip and no new glyph, so the number of visible properties is unchanged

### Requirement: Group headers
Date groups, section groups, project groups and the "Later" group SHALL use one header: a title, a count, a collapse control, and trailing actions that appear on hover, focus or touch. Overdue keeps the danger tone. Collapse state SHALL be remembered per device.

#### Scenario: Collapse a date group
- **WHEN** the user collapses "Tomorrow" in Upcoming and reloads
- **THEN** "Tomorrow" stays collapsed on this device and shows its count

### Requirement: Empty groups
A group with no open tasks SHALL be hidden when it is generated (a date, "No section", "Later"), and SHALL show only its header when it is user-created (a section). A section whose tasks are all completed SHALL show "n completed" in its header with a control that reveals them, except while the project shows its Completed group, which holds those tasks.

#### Scenario: Done section
- **WHEN** a project's "Done" section holds two completed tasks and no open one
- **THEN** its header reads "Done · 2 completed" with a Show control, and no empty body is rendered

#### Scenario: Done section with the Completed group on
- **WHEN** the same project has "Show completed tasks" on
- **THEN** the "Done" header shows no "n completed" and no Show control, and the two tasks are in the Completed group at the end of the list

### Requirement: Nothing between the header and the list
Above the first task of a list there SHALL be at most the page header and the quick add, and the quick add SHALL end at its field and its preview chips: no help link, hint line or note under it. Filters (duration, labels, assignee), layout switches, disclosures, sort notes, promotions, help links and first-run guidance SHALL live in the page header, its menus, the overflow, the Help panel or an overlay, never as rows above or inside the list. A list with no task SHALL show its empty view (see "Empty views") in the place of the rows, with nothing between the quick add and it. This is presentation only and behaves the same offline.

#### Scenario: First task on a phone
- **WHEN** the Inbox with eight tasks opens on a 390×844 screen with the keyboard closed
- **THEN** at least four tasks are visible without scrolling

#### Scenario: Filter affordance
- **WHEN** the user activates Filter in the page header of Today and chooses "Quick wins"
- **THEN** the list is filtered and one active chip with a clear control appears in the header, not above the list

#### Scenario: No help row under the quick add
- **WHEN** a new browser opens the Inbox and has never added a task
- **THEN** the page shows the header, the quick add and the first task, and the only Help control on the page is the header's Help action

#### Scenario: First visit on a fresh account
- **WHEN** an account opens the Inbox for the first time
- **THEN** the list page holds the header, the quick add and the empty view only; the start guide is an overlay over it

### Requirement: Density preference
Settings → Appearance SHALL offer a density of Comfortable (default) or Compact, synced with the appearance preferences, applied to rows, group headers and the sidebar at once.

#### Scenario: Compact rows
- **WHEN** the user chooses Compact
- **THEN** single-line rows are 36 px tall instead of 44 px on fine-pointer devices, and touch targets stay 44 px on coarse pointers

### Requirement: Completion feedback
Completing a task SHALL animate the check mark and fade the row within the emphasis duration before the row leaves or re-sorts, SHALL update counts live, and SHALL offer Undo in a toast for five seconds. Under reduced motion only the opacity fades. Undo SHALL reopen the task as an ordinary operation, applied locally first, so it works offline and converges by last-writer-wins.

#### Scenario: Undo a completion offline
- **WHEN** the device is offline, the user completes a task and activates Undo in the toast
- **THEN** the task is open again at once, the reopening is queued right after the completion as an ordinary op, and other devices converge on the open state

### Requirement: Single-action undo
Deleting a task, moving it to another project, changing its date or parking it SHALL offer the same Undo toast as bulk actions, replacing the previous offer.

#### Scenario: Delete then undo
- **WHEN** the user deletes a task from its row menu and activates Undo
- **THEN** the task returns to its place with its subtasks and no tombstone remains after sync

### Requirement: Bulk selection does not shift rows
The selection checkbox SHALL take the place of the task checkbox only while a selection is in progress (a row is ticked, or touch Select mode is on), so the row does not change width or alignment. Hover and keyboard focus SHALL NOT replace the task checkbox: clicking it always completes or reopens the task.

#### Scenario: Hover a row
- **WHEN** nothing is ticked and the pointer enters a row in a project list
- **THEN** the task checkbox stays in place and the title does not move

#### Scenario: Selection in progress
- **WHEN** one row is ticked
- **THEN** every row shows the selection checkbox where the task checkbox was and no title moves

### Requirement: Drag feedback
A dragged row SHALL lift with the popover elevation and a slight scale, the drop position SHALL show as a line with a dot at its start, and dropping on the middle of a row SHALL ring that row. Under reduced motion the lift is an opacity change.

#### Scenario: Start a drag
- **WHEN** the user drags a task in a project list
- **THEN** the row lifts and the target line appears between rows as the pointer moves

### Requirement: Skeleton loading
While a list, the panel or a settings page waits for local data, it SHALL show skeleton rows in the row's shape, never a spinner or a "Loading…" sentence; the skeleton SHALL be replaced in place.

#### Scenario: Cold start
- **WHEN** the app opens before the local database has answered
- **THEN** the content column shows skeleton rows that are replaced by tasks without a layout jump

### Requirement: Large lists stay responsive

Task lists SHALL do work in proportion to what changed, not to the size of the list or of the task store. Moving the cursor SHALL re-render only the row it leaves and the row it reaches. One write (local or from sync) SHALL read the stored tasks once for every list, count and badge on screen together, not once per component. Grouping a list SHALL take time linear in the number of tasks. With end-to-end encryption on, rows SHALL NOT each open their own query. This holds offline as online: the lists read local storage either way, and every device converges as before because only reads change.

#### Scenario: Cursor moves in a long list

- **WHEN** a project lists 2,000 tasks and the user presses `j` or `k`
- **THEN** at most the two rows whose selection changed render again

#### Scenario: One write with the sidebar and a project open

- **WHEN** a project of 2,000 tasks is open with the sidebar and one task is renamed
- **THEN** the stored tasks are read about once to update the list, the sidebar counts and the project header

#### Scenario: Synced changes refresh every view

- **WHEN** a sync batch lands while the device was offline or online
- **THEN** every open list, count and badge shows the new state from one shared read

#### Scenario: Grouping a large list

- **WHEN** 20,000 tasks fall into one group of a list
- **THEN** grouping them takes linear time (milliseconds, not seconds)

### Requirement: Lists for assistive technology

The keyboard cursor of a task list SHALL be real focus: when the cursor moves to a row, that row's open control SHALL take focus, unless focus is outside the list (the task panel, a dialog, the quick add, a text field, the sidebar), which keeps focus. The cursor row SHALL be marked as current. Rows of the project and Inbox trees SHALL expose their level and their position among their visible siblings. Each row's complete control SHALL be named after its task ("Complete Buy milk", "Reopen Buy milk"), and a title that cannot be decrypted SHALL NOT be read out as ciphertext. Cursor moves SHALL still re-render only the row left and the row reached. This is presentation only and behaves the same offline.

#### Scenario: Moving the cursor

- **WHEN** a list is shown and the user presses `j`
- **THEN** focus is on the first row's open control and the row is marked as current

#### Scenario: Focus stays in the panel

- **WHEN** focus is in the task panel and the cursor moves
- **THEN** focus stays in the panel

#### Scenario: Subtasks

- **WHEN** a project shows a task with two subtasks
- **THEN** the subtask rows are level 2 and positions 1 and 2 of 2

#### Scenario: Complete button

- **WHEN** a row shows the task "Pack"
- **THEN** its complete button is named "Complete Pack"

### Requirement: Completed group in a project
A project's Project menu SHALL offer "Show completed tasks" in the list layout, a preference of the device per project that is off by default and never synced. While it is on, the project's list SHALL end with a "Completed" group holding every completed (not skipped) task of the project, most recently completed first. The group SHALL be closed by default with its count on the heading, and its open or closed state SHALL be remembered on the device. Completing a task SHALL move it into the group; unticking a task in the group SHALL reopen it and return it among the open tasks. The board and the timeline SHALL be unchanged. A completed task's circle SHALL show the filled check without the priority ring.

#### Scenario: Groceries reused
- **WHEN** a user turns on "Show completed tasks" in a Groceries project where Milk and Eggs were ticked off, Eggs last, and opens the Completed group
- **THEN** the group's heading reads "Completed 2", Eggs is listed above Milk, both show a ticked circle, and unticking Milk puts it back among the open tasks

#### Scenario: Off by default
- **WHEN** a user opens a project they never changed the setting for
- **THEN** no Completed group is shown and completed tasks are only in the Completed view

#### Scenario: Board layout
- **WHEN** the project is shown as a board
- **THEN** the Project menu does not offer "Show completed tasks" and the board shows open tasks only

### Requirement: Inline title editing
On a fine pointer from 768 px wide, with the panel closed and the device preference "Click a task to" set to "Edit in place" (the default), clicking a task's title in a list SHALL select the row and turn its title into a text field in place, with the caret where the user clicked. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task panel. Only one row SHALL be edited inline at a time, and that row SHALL not start a drag, so pressing and moving in its field selects text; the other rows stay draggable. Edits SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL never get the inline editor. With the preference set to "Open details", on a coarse pointer, below 768 px, or while the panel is open, a click SHALL open the task in the panel as before.

#### Scenario: Fix a typo in place
- **WHEN** the panel is closed and the user clicks inside the title "Renew pasport" between "pas" and "port", types `s` and presses Enter
- **THEN** the title is "Renew passport", no panel opened, and the row stays selected

#### Scenario: Cancel
- **WHEN** the user is editing a title inline and presses Esc
- **THEN** the title is unchanged, the editor closes and the row is still selected

#### Scenario: Keyboard start
- **WHEN** a row is selected with `j` and the user presses `F2`
- **THEN** the row's title becomes editable with the caret at the end

#### Scenario: Open the details from the editor
- **WHEN** the user is editing inline and presses `Shift+Enter`
- **THEN** the title is saved and the task panel opens on that task

#### Scenario: Panel open means switch
- **WHEN** the panel shows one task and the user clicks another task's title
- **THEN** the panel shows the clicked task and no inline editor opens

#### Scenario: Phone
- **WHEN** the user taps a task's title on a 390 px wide touch screen
- **THEN** the task opens in the panel sheet as before

#### Scenario: Preference to open details
- **WHEN** the user sets "Click a task to" to "Open details" on this device and clicks a title
- **THEN** the panel opens, and on another device the default is still "Edit in place"

#### Scenario: Selecting text does not drag
- **WHEN** the user is editing a title inline in a manually ordered list and drags across the words in its field
- **THEN** the words are selected, the row does not move, and every other row can still be dragged

### Requirement: Contextual edit bar
While a row is edited inline, a bar SHALL show under its title with Date, Priority, Labels and Project, each showing the task's value or a muted placeholder, and an Open details control. Each control SHALL open the same editor the task panel uses for that property and write the same change. Tab SHALL move from the title into the bar, and the bar's popovers SHALL not count as clicks outside the row.

#### Scenario: Make it tomorrow without the panel
- **WHEN** the user is editing "Call the bank" inline, chooses Date and then Tomorrow
- **THEN** the task is due tomorrow, the bar's Date reads "Tomorrow", the inline editor is still open, and no panel opened

#### Scenario: Labels from the bar
- **WHEN** the user opens Labels from the bar and ticks "errand"
- **THEN** the task gains the label "errand" and the editor stays open until the user saves or clicks away

#### Scenario: Details
- **WHEN** the user activates Open details in the bar
- **THEN** the title is saved and the panel opens on the task

### Requirement: Clearing the selection
A click on any empty part of the content column (between or below the rows, the page margins, the empty part of the page header) SHALL save an open inline edit, clear the selection and close the task panel. Clicks inside the panel, inside a popover, menu or dialog, or on a control SHALL NOT clear it. Esc SHALL keep closing the panel first and then clearing the selection.

#### Scenario: Click below the list
- **WHEN** a task is selected with the panel open and the user clicks the empty space below the last row
- **THEN** no row is selected, the panel is closed, and the list has its full width

#### Scenario: Click inside the panel
- **WHEN** a task is selected with the panel open and the user clicks the panel's notes
- **THEN** the task stays selected and the panel stays open

#### Scenario: Inline edit is saved
- **WHEN** the user has typed a new title inline and clicks the page margin
- **THEN** the new title is saved and no row is selected

### Requirement: Selected row indicator
The selected row SHALL be marked by a 2 px accent bar at its leading edge and a faint accent tint, with no border or ring around the row and no full-strength background. Hovering a row SHALL only give it a neutral tint lighter than the selected row's tint: no border, ring, shadow, size change or newly shown control. Hovering the selected row SHALL add nothing to its selection marks, and the row's metadata line SHALL keep its colours while hovered. The indicator SHALL meet 3:1 non-text contrast against the list background in the light and dark themes, SHALL differ from hover and from ticked rows, and SHALL not change the row's size or the position of its content. Keyboard focus SHALL keep its focus outline.

#### Scenario: Selected and hovered rows differ
- **WHEN** one row is selected and the pointer hovers another
- **THEN** the selected row shows the leading accent bar and tint, the hovered row only a neutral tint lighter than the selection's, and neither has a ring

#### Scenario: Contrast in dark mode
- **WHEN** the theme is dark and a row is selected
- **THEN** the leading bar has at least 3:1 contrast against the list background

#### Scenario: Hover over a two-line row
- **WHEN** the pointer moves over a row with a title and a metadata line
- **THEN** only a light neutral tint appears behind it, nothing in the row moves or changes size, and the metadata keeps its colours

#### Scenario: Hover over the selected row
- **WHEN** the pointer moves over the selected row
- **THEN** the row looks the same as when the pointer is elsewhere

### Requirement: Row detail in lists
Every task list and board SHALL render rows in the Calm or the Detailed language according to the user's row detail preference, switching at once when it changes, offline as online, without a reload and without writing anything. Rendering a row in either detail SHALL read local data only; every device with the same preference and the same rows SHALL show the same row, so there is nothing to converge. The row's size, targets, keyboard behaviour, selection and drag SHALL be the same in both.

#### Scenario: Switching the detail
- **WHEN** the user switches from Calm to Detailed in Settings → Appearance while a project list is open on another tab of the same device
- **THEN** that list shows every chip and colour at once, and switching back restores the Calm rows, with no op written for the rows themselves

#### Scenario: A new device
- **WHEN** a user who never chose a row detail opens the app on a new device
- **THEN** the rows are Calm

#### Scenario: Nothing moves
- **WHEN** a row is shown in Calm and then in Detailed
- **THEN** the checkbox, the title and the leading slot keep their positions, the row keeps its 44 px targets on coarse pointers, and `j`, `k`, `c`, Enter and Shift+click behave the same

### Requirement: Empty views
A view with nothing to list SHALL show one empty view, centred in the content column: one sentence, one primary action, and at most one secondary text link; no icon, no second sentence, no second button, no printed key hint. The action's key, when it has one, SHALL be in its tooltip on fine-pointer devices only. Each view's copy is a scenario below. The empty view SHALL be one region with the sentence as its heading, reads local data (so it is the same offline) and writes nothing.

#### Scenario: Inbox
- **WHEN** the Inbox has no open task
- **THEN** it reads "Your Inbox is empty." with "Add a task", which focuses the quick add (the quick-add sheet on a phone), and no link

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today." with an "Add a task" button and an "Open Upcoming" link, no icon and no key hint, and the button opens the quick-add sheet

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop with a mouse
- **THEN** the same sentence, button and link are shown, no hint is printed, and hovering or focusing the button shows "Press q"

#### Scenario: Everything waits
- **WHEN** Today has three tasks that are all blocked by other tasks
- **THEN** it reads "Nothing is ready to start today." with "Add a task" and the link "3 waiting for other tasks", which opens Waiting

#### Scenario: Upcoming, Anytime, Someday
- **WHEN** Upcoming, Anytime or Someday has no task
- **THEN** it reads "Nothing scheduled yet.", "Nothing waiting for a free moment." or "Nothing parked for later." with "Add a task" (the view's defaults applied) and no link

#### Scenario: Assigned to me
- **WHEN** nothing is assigned to the user
- **THEN** it reads "Nothing is assigned to you." with "Open Inbox"

#### Scenario: Next and Waiting
- **WHEN** no project has a next action, or nothing is waiting
- **THEN** Next reads "Add a next step to a project." with "Walk your projects", and Waiting reads "Nothing is waiting on anyone." with "Open Next"

#### Scenario: Project
- **WHEN** a project in the list layout has no open task
- **THEN** it reads "This project has no open tasks." with "Add a task", or "Open Inbox" when the project is read-only for the user

#### Scenario: Project with completed tasks only
- **WHEN** a project's tasks are all completed and its Completed group is off
- **THEN** the empty view offers the link "Show 4 completed", which turns the Completed group on

#### Scenario: Label
- **WHEN** no open task carries the label
- **THEN** it reads "No open task carries this label." with "Add a task" (the label applied)

#### Scenario: Filters
- **WHEN** a filter query, a saved filter or the duration filter matches no task
- **THEN** it reads "No task matches this filter." with "Clear the filter", "No task matches this view." with "Edit the view", or "No task matches this duration filter." with "Clear the filter"

#### Scenario: Completed has no quick add
- **WHEN** Completed is empty
- **THEN** it reads "Nothing completed yet." with "Open Today" and no "Add a task"

#### Scenario: Trash
- **WHEN** the Trash is empty
- **THEN** it reads "The Trash is empty." with one "Open Inbox" button and nothing else

#### Scenario: Calendar day
- **WHEN** a day of the Day view, the week's agenda or the month's day list has nothing planned
- **THEN** it reads "Nothing planned." with "Add a task", which opens quick add with that day as the date

#### Scenario: Inbox triage
- **WHEN** triage runs out of Inbox tasks
- **THEN** it reads "Inbox zero: every task has a place." with "Back to the Inbox"

#### Scenario: Gone target is not an empty view
- **WHEN** a project or label route names one that no longer exists
- **THEN** the page keeps its own note with the way back, not an empty view

#### Scenario: A task arrives
- **WHEN** the Inbox shows its empty view and another device captures a task, which syncs
- **THEN** the empty view is replaced by the task's row without a reload
