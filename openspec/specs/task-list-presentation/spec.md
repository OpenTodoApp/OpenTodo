# task-list-presentation Specification

## Purpose
Defines how a task reads in every list and board: one row anatomy, one metadata language, one group header, how empty groups behave, density, and the feedback a user gets when completing or undoing an action.

## Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. The layout SHALL follow the width of the row itself, not of the screen. From 40 rem of row width a row SHALL be one line: the title on the left and the properties in a right-hand column of fixed cells, in this order: the date, the project when the list shows projects, one cell holding the labels, else the deadline, else the subtask progress, the estimate, and the assignee; every row of a list SHALL use the same cell widths, so each property lines up down the list, and an empty cell keeps its width. As the row narrows the column SHALL drop cells from its end: under 56 rem the estimate and the assignee, and under 48 rem the third cell when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the labels take its cell, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target.

#### Scenario: Same alignment across views
- **WHEN** the user moves between Today, the Inbox and a project without sections
- **THEN** the checkboxes of top-level tasks are at the same horizontal position in all three

#### Scenario: Titles align within a list
- **WHEN** Today lists a task due at 10:00 and a task with no time
- **THEN** both titles start at the same horizontal position, the first row's time in the column and the second row's column empty

#### Scenario: Single-line rows
- **WHEN** a task has no date, labels, estimate, subtasks, comments or attachments, or a list row is at least 40 rem wide and the task has only properties the column holds
- **THEN** its row is one line tall

#### Scenario: Counts on demand
- **WHEN** a task has 2 of 3 subtasks done and 3 comments
- **THEN** "2/3" and "3" are beside the title in the faint text colour, become the muted text colour while the pointer is over the row or its open control has focus, and a screen reader hears "2 of 3 subtasks completed" and "3 comments" either way

#### Scenario: Project at the row's end
- **WHEN** Upcoming lists a task of the project "Home renovation" on a 1280 px screen
- **THEN** "Home renovation" is muted text with the project's dot in the project cell of the right-hand column, aligned with the project of every other row, and on a 390 px screen the same name is in the metadata line under the title

#### Scenario: Counts on a touch screen
- **WHEN** the same row is shown on a device without hover
- **THEN** the counts are shown at low contrast, still readable, and no extra tap target exists

### Requirement: Metadata language
Row metadata SHALL be one language in every list and on every card. A list row's properties SHALL be at the metadata size in the muted text colour: in the right-hand column of a one-line row, each in its cell (the date, the estimate and the subtask progress with their icons, the assignee as an avatar named in its tooltip and for assistive technology), and in a narrower row one run of text under the title, its items separated by a middle dot, in this order: the date words with evening as a suffix, the project, the labels or the deadline or the subtask progress, the estimate (`1h`, or `35m / 1h` once time was tracked, or `35m` alone without an estimate), the assignee, then the parent's name, the deadline countdown with its hourglass icon when the time column and the third cell do not already hold it, the start ("Starts 3 Nov", "Started 1 Nov", "Someday"), blocked ("Blocked by 2" with its lock icon), the habit streak with its flame icon, and up to three custom field values and "+n" for the rest. The repeat mark SHALL be the repeat icon beside the title, read as "repeats" (an occurrence: "occurrence"). A card's line SHALL keep one run in the order of the date words, the repeat word with its icon, the deadline, the start, the estimate, blocked, the streak, the field values, the assignee and the project. The origin (the icon for its kind and the external id, else the URL's host; a link opening in a new tab without passing the referrer when it has a URL, never opening the task) SHALL be in the row's trailing group and at the end of a card. Labels SHALL be chips: each a small chip with the label's colour as a dot and its name, at most two shown, then "+n"; the full names in order SHALL be read by assistive technology, shown in a tooltip while the pointer is over the group or it has keyboard focus, and in the task panel. No other item of a row SHALL have a pill background. Counts SHALL use tabular figures, not a monospace face.

Colour SHALL carry meaning only: the priority ring on the checkbox is coloured for P1 and P2 and neutral for P3 and P4; the date text follows one due ladder by how close the task's day is to the user's logical today: a date after tomorrow in the muted tone; tomorrow, as "Tomorrow" or the time under the Tomorrow heading, in the default text tone; today, timed or not, in the accent tone; and a day before today in the danger tone. A heading that implies the day leaves the date text out, so the ladder shows on the parts that remain (a time, "evening", the repeat mark). The ladder is computed on the device from local data and changes with the logical day without a reload; the deadline keeps its neutral, warning and danger tones; the label dot is the label's colour; everything else in the row is the muted colour, and the counts the faint colour. Every colour is a token.

What the view or the group heading already says SHALL be left out, by this table; everything else is shown when set:

| View or group | Left out of the row | Kept |
| --- | --- | --- |
| Inbox | the project | everything else |
| Today, today's group | the date word "Today" | the time in the column, "evening", the repeat word |
| Today, This Evening group | "Today" and "evening" | the time, the repeat word |
| Today, Overdue and Blocked groups | nothing | the date, so how late it is stays visible |
| Upcoming, a date group | the date words of that day | the time, "evening", the repeat word, the deadline |
| A project, list layout | the project | sections are not on rows anyway |
| A project, board | the project and the section (the column says it) | the rest, including the field values |
| A project, Later group | nothing | "Starts" and "Someday" |
| A label's view | the chip of that label | other labels, the date, counts |
| Someday | "Someday" | the project |
| A saved view grouped by project | the project | everything else |
| Plan and the calendar's day lists | the date words (the column says the day) | the time, the estimate, the priority ring |
| Anytime, Assigned, Completed, filters, dashboards, Next, Waiting, the review and Loop screens, Close the day, Trash | nothing | everything |

A row SHALL never omit a value because of what it is, only because the heading or the view already states it. The omission is presentation only: nothing is written, and the same task shows the same row on every device.

#### Scenario: Recurring evening task
- **WHEN** a task is due today, repeats every day and is marked for the evening, and Today shows it under This Evening
- **THEN** its row shows only the repeat icon beside the title, read as "repeats", with no date text and no pill

#### Scenario: Timed task in Today
- **WHEN** a task is due today at 10:00
- **THEN** its Today row shows "10:00" in the accent colour in the time column and no "Today" in the line, while the same task in its project shows "10:00" in the column and "Today" in the accent colour in the line

#### Scenario: Overdue stays loud
- **WHEN** a task was due three days ago with an estimate and two labels
- **THEN** its row in Today's Overdue group and in its project shows the date in the danger colour, and the estimate and the label names in the muted colour

#### Scenario: One run of text
- **WHEN** a task in Upcoming's Friday group is due at 14:00 with a 45-minute estimate, repeats weekly and has the label "work"
- **THEN** the time column shows "14:00", the repeat icon sits beside the title, "work" is a chip with its dot in the third cell and "45m" is muted text in the estimate cell, with no grey pill around the estimate

#### Scenario: Tracked time stays one chip
- **WHEN** a task estimated at one hour has 35 minutes tracked
- **THEN** its row reads `35m / 1h` as one item, with no second item and no glyph, and the number of visible properties is unchanged

#### Scenario: Neutral ring for P3 and P4
- **WHEN** a list holds a P1, a P2, a P3 and a P4 task
- **THEN** the P1 and P2 circles carry their priority colours and the P3 and P4 circles carry the neutral ring

#### Scenario: Three labels on a row
- **WHEN** a task carries the labels errand, call and home, in that order
- **THEN** the row shows the chips "errand" and "call" with their dots and "+1", a screen reader hears "Labels: errand, call, home", and hovering or focusing the group shows all three names

#### Scenario: Inside the label's view
- **WHEN** the errand label's view lists that task
- **THEN** the row shows the chips of call and home only

#### Scenario: Inbox rows
- **WHEN** the Inbox is shown
- **THEN** no row carries an "Inbox" item

#### Scenario: Board card inside its project
- **WHEN** a project board shows a card with a section, a project, two labels and a deadline
- **THEN** the card shows no project and no section, and shows the deadline in the line and the two label chips

#### Scenario: Upcoming under Tomorrow
- **WHEN** Upcoming lists a task due tomorrow at 09:30 under the Tomorrow heading
- **THEN** the column shows "09:30" and the line has no "Tomorrow", and a task due tomorrow without a time has an empty column and no date text under that heading

#### Scenario: Custom field values as text
- **WHEN** a task in a project with the fields Cost, Status, Paid, Client and Vendor holds five non-empty values
- **THEN** the row's second line shows "Cost 120 · Status Ordered · Paid" in the muted colour and "+2", whose accessible name lists the rest, with no pill around any of them

#### Scenario: Issue chip opens the issue
- **WHEN** a task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` and the user clicks its item
- **THEN** the issue opens in a new tab, the task panel does not open, and the item's accessible name says it opens the source "o/r#7"

#### Scenario: Captured page on a card
- **WHEN** a task captured from `https://example.org/post` with title "Interesting article" is shown on the board
- **THEN** the card's line carries a link reading "example.org", and a task without an origin carries no origin item

#### Scenario: Email origin without a link
- **WHEN** a task's origin is `{kind: "email", id: "<a1@mail.example>"}`
- **THEN** its item shows the at sign and reads "Email", is not a link, and the Message-ID is not shown

#### Scenario: Tomorrow in a project
- **WHEN** a project lists a task due tomorrow without a time
- **THEN** its row reads "Tomorrow" in the default text tone, while a task due in four days reads its date in the muted tone

#### Scenario: Today without a time
- **WHEN** a project lists a task due today without a time
- **THEN** its row reads "Today" in the accent tone, and the same task under Today's own group shows no date text

#### Scenario: Midnight moves a task up the ladder
- **WHEN** a task due tomorrow is shown in a project list and the user's logical day advances
- **THEN** the row's date turns to "Today" in the accent tone without a reload, and the day after that to the date in the danger tone

#### Scenario: Deadline keeps its countdown
- **WHEN** a task due tomorrow has a deadline in two days
- **THEN** "Tomorrow" is in the default text tone and the countdown "2d" is in the warning tone

### Requirement: Group headers
Date groups, section groups, project groups, the Earlier group, the "Later" group and the Completed group SHALL use one header: a label, a count, a collapse control, and trailing actions. In a list the header SHALL be a group bar: a 32 px strip filled with the raised surface, with the label at the metadata size in the medium weight and the default text tone, in sentence case whether the view generated the group (a date, Earlier, Today, This Evening, Blocked, Later, Completed, No section) or the user named it (a section, a project, a label); on a board column the header SHALL stay a plain heading on the column's surface. The count SHALL be in the faint tone with tabular figures. Trailing actions SHALL appear on hover, focus or touch, except the actions of the Earlier group, which SHALL be visible at all times. No group header SHALL use the danger tone. Collapse state SHALL be remembered per device; the Earlier group of Today SHALL be collapsed by default on a device that never opened or closed it while it holds more than five tasks, and open by default otherwise. This is presentation only and behaves the same offline.

#### Scenario: Collapse a date group
- **WHEN** the user collapses "Tomorrow" in Upcoming and reloads
- **THEN** "Tomorrow" stays collapsed on this device and shows its count

#### Scenario: A generated and a named group
- **WHEN** Upcoming shows the "Tomorrow" group and a project shows its "Planning" section
- **THEN** "Tomorrow" and "Planning" are both group bars in sentence case at the metadata size, medium weight, in the default text tone, with their counts in the faint tone

#### Scenario: Earlier is quiet
- **WHEN** Today lists three tasks due before today
- **THEN** the first group bar reads "Earlier" in the default text tone with "3" in the faint tone, each task's date is in the danger tone, and no other part of the group is red

#### Scenario: Earlier collapsed by default
- **WHEN** a user who never touched the group opens Today with eight tasks due before today
- **THEN** the Earlier group shows its label, "8", "Move all to today" and "Reschedule…" and no rows, and opening it is remembered on this device

#### Scenario: Earlier open by default
- **WHEN** a user who never touched the group opens Today with two tasks due before today
- **THEN** the Earlier group shows its two rows

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
Completing a task SHALL write the completion as an ordinary operation at once (applied locally first, queued for sync, converging by last-writer-wins) and SHALL update every count live at that moment. The row SHALL then play a completion sequence within the moment duration: the check mark fills and pops, the title gains a strike-through and the row's text fades, the row collapses while the rows below move up, and the Undo toast enters; the list SHALL keep the row on screen as a *departing* row during the sequence, where it takes no input except Undo and is not counted or selectable. Completing several tasks in quick succession SHALL play each sequence independently without queueing and without delaying any write. Undo during the sequence SHALL cancel the departure and keep the row in place. Under reduced motion only the row's opacity fades; under no motion the row leaves at once. A board card SHALL play the same sequence in its column. Undo SHALL reopen the task as an ordinary operation, applied locally first, so it works offline and converges by last-writer-wins. The toast SHALL offer Undo for five seconds after a single completion.

#### Scenario: Undo a completion offline
- **WHEN** the device is offline, the user completes a task and activates Undo in the toast
- **THEN** the task is open again at once, the reopening is queued right after the completion as an ordinary op, and other devices converge on the open state

#### Scenario: The write does not wait for the animation
- **WHEN** the user completes a task and the device loses power 50 ms later
- **THEN** the completion is already in the local database and syncs on the next start

#### Scenario: Three in a row
- **WHEN** the user presses the complete key on three consecutive rows within half a second
- **THEN** each row starts its own sequence as its key is pressed, the cursor moves on at once each time, and all three completions are written in the order pressed

#### Scenario: Undo mid-sequence
- **WHEN** the user completes a task and activates Undo 200 ms later
- **THEN** the row stops departing, returns to its open state in place, and no second move plays

#### Scenario: Departing row is not a target
- **WHEN** a row is departing and the user presses the select key or drags over it
- **THEN** the selection and the drop position skip it as if it had already left

#### Scenario: A repeating task rolls forward
- **WHEN** the user completes a task that repeats every Monday
- **THEN** the check mark pops and returns to its open state, the date crossfades to the next Monday, the row tints briefly instead of leaving, and the toast names the next occurrence with Undo

#### Scenario: A habit keeps its streak
- **WHEN** the user completes a habit due today
- **THEN** the repeating sequence plays and the streak chip updates its number with a fade

#### Scenario: Card on a board
- **WHEN** the user completes a card on the board
- **THEN** the card plays the completion sequence, collapses, and the cards below it in the column move up

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
While a list, the panel or a settings page waits for local data, it SHALL show skeleton rows in the row's shape, never a spinner or a "Loading…" sentence; the skeleton SHALL be replaced in place. A screen SHALL draw what depends on its local data only once that data has been read, never an empty state, empty groups, a header that is replaced, or a sidebar group that opens and then folds first: a list, a project and Statistics draw nothing below the shell until then, and the Plan, Projects and Updates show their skeleton. A settings section whose cards ask the server SHALL draw its cards together once each has its first answer, waiting at most 600 ms, so a card that grows with its answer does not push the cards below it. On these screens the audit's layout shift (M12) SHALL stay at or below 0.1 at every width.

#### Scenario: Cold start
- **WHEN** the app opens before the local database has answered
- **THEN** the content column shows skeleton rows that are replaced by tasks without a layout jump

#### Scenario: Project opens with its tasks
- **WHEN** a project with three sections opens on a phone before the local database has answered
- **THEN** the sections appear with their tasks in one step, without first showing empty sections or "This project has no open tasks"

#### Scenario: Subtitle arrives on a phone
- **WHEN** the Inbox opens at 360 px with planned tasks without a project
- **THEN** their folded group appears at the end of the list in the same step as the Inbox's tasks, and nothing appears under the title later
#### Scenario: Settings cards answer at different times
- **WHEN** Settings → Integrations opens and the app passwords answer 200 ms after the calendar feeds
- **THEN** the section's cards appear together when the last first answer arrives, and after 600 ms they appear in any case

#### Scenario: Later reloads do not hide the page
- **WHEN** the user creates an app password and the list reloads
- **THEN** the section stays visible while it reloads

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
A project's Project menu SHALL offer "Show completed tasks" in the list layout, a preference of the device per project that is off by default and never synced. While it is on, the project's list SHALL end with a "Completed" group holding every completed (not skipped) task of the project, most recently completed first. The group SHALL be closed by default with its count on the heading, and its open or closed state SHALL be remembered on the device. Completing a task SHALL move it into the group; unticking a task in the group SHALL reopen it and return it among the open tasks. While it is off and the project has completed tasks, a list with open tasks SHALL end with one line, "n completed tasks hidden by display options" and a Show link that turns the preference on. The board and the timeline SHALL be unchanged. A completed task's circle SHALL show the filled check without the priority ring.

#### Scenario: Groceries reused
- **WHEN** a user turns on "Show completed tasks" in a Groceries project where Milk and Eggs were ticked off, Eggs last, and opens the Completed group
- **THEN** the group's heading reads "Completed 2", Eggs is listed above Milk, both show a ticked circle, and unticking Milk puts it back among the open tasks

#### Scenario: Off by default
- **WHEN** a user opens a project they never changed the setting for
- **THEN** no Completed group is shown, completed tasks are only in the Completed view, and the list ends with "2 completed tasks hidden by display options · Show" when two were completed

#### Scenario: Board layout
- **WHEN** the project is shown as a board
- **THEN** the Project menu does not offer "Show completed tasks" and the board shows open tasks only

### Requirement: Inline title editing
On a fine pointer from 768 px wide, with the panel closed and the device preference "Click a task to" set to "Edit in place" (the default), clicking a task's title in a list SHALL select the row and turn its title into a text field in place, with the caret where the user clicked. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task panel. Only one row SHALL be edited inline at a time, and that row SHALL not start a drag, so pressing and moving in its field selects text; the other rows stay draggable. Edits SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL never get the inline editor. With the preference set to "Open details", on a coarse pointer, below 768 px, or while the panel is open, a click SHALL open the task in the panel as before. A click on a row's or a board card's empty area (anything that is not the title, the checkbox, the chevron, the selection box, a link or a revealed action: the padding, the gaps, the leading slot, the trailing space) SHALL select the task and open it in the panel under either preference and on any pointer, Shift or Ctrl/⌘ on it SHALL tick the row as on the title, and a drag or a swipe that ends on it SHALL not open anything. The row's controls keep their own actions and the keyboard behaviour is unchanged.

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

#### Scenario: Empty area opens the panel
- **WHEN** "Click a task to" is "Edit in place", the panel is closed, and the user clicks a row in the space between its title and its project name
- **THEN** the row is selected and the task opens in the panel, and no inline editor opens

#### Scenario: Empty area with "Open details"
- **WHEN** "Click a task to" is "Open details" and the user clicks a row's left padding
- **THEN** the task opens in the panel

#### Scenario: Controls keep their actions
- **WHEN** the user clicks a row's checkbox, its chevron or its revealed More action
- **THEN** the task completes, its subtasks fold, or the row menu opens, and the panel does not open

#### Scenario: A drag does not open
- **WHEN** the user presses a row's empty area, drags it to another place in a manually ordered list and releases
- **THEN** the task moves and the panel does not open

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
The selected row SHALL be marked by a 2 px accent bar at its leading edge on the neutral selected-row surface, with no border or ring around the row. Hovering a row SHALL give it the neutral hover surface, lighter than the selected row's, and, on a fine pointer from 768 px, reveal the row actions (see "Revealed row actions") in the place of the trailing group; nothing else: no border, ring, shadow or size change, and the row's metadata line SHALL keep its colours while hovered. Hovering the selected row SHALL add nothing to its selection marks beyond the revealed actions. The indicator SHALL meet 3:1 non-text contrast against the list background in the light and dark themes, SHALL differ from hover and from ticked rows, and SHALL not change the row's size or the position of its content. Keyboard focus SHALL keep its focus outline.

#### Scenario: Selected and hovered rows differ
- **WHEN** one row is selected and the pointer hovers another
- **THEN** the selected row shows the leading accent bar on the selected-row surface, the hovered row only the lighter hover surface plus its revealed actions, and neither has a ring

#### Scenario: Contrast in dark mode
- **WHEN** the theme is dark and a row is selected
- **THEN** the leading bar has at least 3:1 contrast against the list background

#### Scenario: Hover over a two-line row
- **WHEN** the pointer moves over a row with a title and a metadata line on a 1280 px screen
- **THEN** the hover surface appears behind it and the actions appear at its right edge, nothing in the row moves or changes size, and the metadata keeps its colours

#### Scenario: Hover over the selected row
- **WHEN** the pointer moves over the selected row
- **THEN** the row keeps its bar and surface and shows only the revealed actions in addition

### Requirement: Empty views
A view with nothing to list SHALL show one empty view, centred in the content column: one sentence, at most one primary action, and at most one secondary text link; no icon, no second sentence, no second button, no printed key hint. The action's key, when it has one, SHALL be in its tooltip on fine-pointer devices only. A list that shows its own quick-add field above the empty view SHALL offer no "Add a task" button: the field is the way to add, and `q` still focuses it (or opens the quick-add sheet on a touch device). Each view's copy is a scenario below. The empty view SHALL be one region with the sentence as its heading, reads local data (so it is the same offline) and writes nothing.

#### Scenario: Inbox
- **WHEN** the Inbox has no open task
- **THEN** it reads "Inbox zero: every task has a place." with no button and no link, under the Inbox's quick add

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today." with an "Open Upcoming" link, no button and no key hint, and the quick add above it stays the way to add

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop with a mouse
- **THEN** the same sentence and link are shown, no button and no hint, and `q` focuses the quick add

#### Scenario: Everything waits
- **WHEN** Today has three tasks that are all blocked by other tasks
- **THEN** it reads "Nothing is ready to start today." with the link "3 waiting for other tasks", which opens Waiting, and no button

#### Scenario: Upcoming, Anytime, Someday
- **WHEN** Upcoming, Anytime or Someday has no task
- **THEN** it reads "Nothing scheduled yet.", "Nothing waiting for a free moment." or "Nothing parked for later." with no button and no link

#### Scenario: Assigned to me
- **WHEN** nothing is assigned to the user
- **THEN** it reads "Nothing is assigned to you." with "Open Inbox"

#### Scenario: Next and Waiting
- **WHEN** no project has a next action, or nothing is waiting
- **THEN** Next reads "Add a next step to a project." with "Walk your projects", and Waiting reads "Nothing is waiting on anyone." with "Open Next"

#### Scenario: Project
- **WHEN** a project in the list layout has no open task
- **THEN** it reads "This project has no open tasks." with no button, or with "Open Inbox" when the project is read-only for the user (it has no quick add)

#### Scenario: Project with completed tasks only
- **WHEN** a project's tasks are all completed and its Completed group is off
- **THEN** the empty view offers the link "Show 4 completed", which turns the Completed group on

#### Scenario: Label
- **WHEN** no open task carries the label
- **THEN** it reads "No open task carries this label." with no button; the label's quick add above applies the label

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

#### Scenario: Place
- **WHEN** no open task happens at a saved location
- **THEN** its page reads "No open task happens at this location." with no button

### Requirement: Time column
Every task list SHALL reserve, between the checkbox and the title, a column for the one value that places a task in the day: the due time in the user's time format, or, when the task has no due time and has a deadline, the deadline countdown (`3d`, `Today`, `2d over`) in its tone, or nothing. The column SHALL be shown for a whole list, at one width per list computed from the widest value the user's time format can produce, in tabular figures at the metadata size, when at least one visible row has a value for it, and SHALL be absent otherwise, so the checkbox position never changes and titles align within a list. The time SHALL take the date's tone rules: accent when the task is due today, danger when overdue, muted otherwise. A zone-fixed due SHALL show the viewer's local time in the column and its zone hint in the metadata line. The column is presentation only: it reads the row's own fields, writes nothing, and is the same offline and on every device. Below 640 px the column SHALL stay, at the same width rule, because a day on a phone is the day that most needs to scan.

#### Scenario: A day scans as a schedule
- **WHEN** Today lists tasks due at 09:00, 11:30 and 14:00 and one without a time, in the 24-hour format
- **THEN** the three times are stacked in one column of equal width in tabular figures, the fourth row's column is empty, and all four titles start at the same position

#### Scenario: Width follows the time format
- **WHEN** the user switches the time format from 24-hour to 12-hour
- **THEN** every list's column widens at once to fit "12:00 PM" and the titles move together, without a reload

#### Scenario: Deadline in the column
- **WHEN** today is 2026-10-14 and a task with no due time has the deadline 2026-10-17
- **THEN** its column shows "3d" in the warning tone, and the metadata line does not repeat the countdown

#### Scenario: Time and deadline
- **WHEN** a task is due today at 10:00 and has the deadline 2026-10-17
- **THEN** the column shows "10:00" in the accent and the line shows the countdown "3d" with its hourglass

#### Scenario: No column for an untimed list
- **WHEN** a project lists six tasks, none with a due time or a deadline
- **THEN** no column is rendered and the titles start directly after the checkbox

#### Scenario: Overdue time
- **WHEN** a task was due yesterday at 18:00 and is listed in Today's Overdue group
- **THEN** the column shows "18:00" in the danger tone and the line shows yesterday's date in the danger tone

#### Scenario: Zone-fixed due
- **WHEN** a task is due at 15:00 fixed to Europe/Rome and the viewer is in America/New_York
- **THEN** the column shows "09:00" and the line shows "fixed to Europe/Rome" in the faint colour

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold three actions at its right edge, shown while the pointer is over the row or focus is inside it as one small floating cluster on the popover surface: over the end of the property column of a one-line row, and in the place of the trailing group of a narrower row, which keeps room for them: Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the properties, or hide the counts or the properties from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key and long press. Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field.

#### Scenario: Reveal on hover
- **WHEN** the pointer enters a row with two comments on a 1280 px screen
- **THEN** Schedule, Priority and More appear in a floating cluster at the row's right edge, the "2" beside the title stays, and the title does not move

#### Scenario: Reveal on focus
- **WHEN** the user presses `j` to focus a row's open control and then Tab
- **THEN** focus moves to Schedule, the three actions are visible, Tab moves on to Priority and More, Shift+Tab returns, and `j` from the open control skips them

#### Scenario: Schedule from the row
- **WHEN** the user activates Schedule on a row and picks Tomorrow
- **THEN** the task is due tomorrow, the row re-sorts or stays as the view requires, and a toast offers Undo, exactly as `s` then Tomorrow would

#### Scenario: Priority from the row
- **WHEN** the user activates Priority and chooses P1 while offline
- **THEN** the checkbox ring turns P1 at once and the change reaches other devices after the next sync

#### Scenario: Touch screen
- **WHEN** a row is shown on a coarse pointer at 1024 px
- **THEN** no action buttons are rendered, the counts stay, and a long press selects the row so its actions are in the phone bar (bulk-actions "Select with a pointer or on touch")

#### Scenario: Focus not obscured
- **WHEN** the focused More button of the last visible row sits under where a toast appears, and a toast appears
- **THEN** the list scrolls or the toast is placed so that the whole button stays visible

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer and hovers a row
- **THEN** no actions appear, because the row has no edits to offer

### Requirement: One row on the board, in Plan and in the review screens
Board cards, the compact rows of Plan and the calendar's day lists, and the rows of the weekly review walk, the Daily check, the Monthly look and Close the day SHALL render from the one row component in one of three shapes (row, card, compact) and SHALL follow the same metadata language, tone rules and omission table. A card SHALL show the time or countdown first in its line instead of a column. A compact row SHALL show the time, the title, the estimate and the priority ring only. Nothing else SHALL draw a task row.

#### Scenario: Card content
- **WHEN** a task with a date and time, three labels, an estimate and two comments is shown as a card
- **THEN** the card shows the title, then "10:00 · 1h" in the muted colour with the time first, two label chips and "+1", and the comment count at the end of the line, and nothing else

#### Scenario: Plan row
- **WHEN** a task due Thursday at 08:30 with a 15-minute estimate and priority P2 is shown in the Plan's Thursday column
- **THEN** the compact row shows "08:30", the title, "15m" and the P2 ring, no date words and no project

#### Scenario: Close the day rows
- **WHEN** Close the day lists the day's unfinished tasks
- **THEN** each row has the same column, line and chips as in Today, with the decision controls after it

### Requirement: List reflow
When a local action changes which rows a visible list shows or where they sit (completion, reschedule, drag and drop, a bulk action, Undo, a drop on the sidebar), the list SHALL animate rows that stay to their new places and fade in rows that arrive, within the moment duration, using the browser's view transition and no library. The list SHALL animate at most a bounded number of rows (the rows on screen, never more than 40); a change that affects more rows, a change that arrives from sync or another device, a change while a text field in the list has focus, and every change under reduced motion SHALL apply instantly with no transition. In a browser without view transitions the list SHALL update instantly and work the same. A transition SHALL never delay the write it accompanies, and a new change during a running transition SHALL cut the running one short rather than wait.

#### Scenario: Reschedule in Today
- **WHEN** the user presses the schedule key on a task in Today and picks Tomorrow
- **THEN** the task's row fades out, the rows below slide up to close the gap, and the Today count changes at the same moment

#### Scenario: Drag to another section
- **WHEN** the user drops a row into another section of a project list
- **THEN** the row travels to its new place and the rows of both sections slide to make and close room

#### Scenario: Sync batch applies instantly
- **WHEN** another device reschedules five tasks and the batch arrives while Today is open
- **THEN** the list shows the new state without any row movement animation

#### Scenario: Too many rows
- **WHEN** a bulk action moves 60 tasks out of the open list
- **THEN** the list updates instantly with no transition

#### Scenario: Browser without the API
- **WHEN** the list is used in a browser that lacks view transitions and the user reschedules a task
- **THEN** the task moves at once and nothing else differs

#### Scenario: Typing is never interrupted
- **WHEN** the user is editing a title in place and a drag elsewhere in the list drops
- **THEN** the list updates instantly and the title field keeps focus and its caret

### Requirement: Words for tasks that are late
The web app, the Daily check, the Today display, the weekly review and the digest SHALL NOT use the word "overdue" or its translations for the user's tasks. A group of tasks whose day has passed SHALL be called "Earlier"; a count of them "n from earlier"; a sentence about them "still open from earlier". Measurements keep their words: Statistics' "completed late" and "slipped", and the deadline countdown's "nd over". The filter query keyword `overdue` and the REST API are unchanged. The words SHALL be translated in every interface language and checked by the translation check.

#### Scenario: Daily check
- **WHEN** the Daily check lists two tasks due before today
- **THEN** their group is labelled "Earlier" and nothing on the page reads "overdue"

#### Scenario: Weekly review's Look back
- **WHEN** Look back shows two tasks due before today
- **THEN** its note reads "2 from earlier" and the step reads as done once both have a new date or are completed

#### Scenario: Carry over in Close the day
- **WHEN** Carry over lists a task that was due on Monday
- **THEN** its row shows Monday's date in the danger tone and the step's text says "still open from earlier", not "overdue"

#### Scenario: Statistics keep their measurements
- **WHEN** Statistics shows "completed late 3" and "slipped 2"
- **THEN** both words are unchanged

#### Scenario: Query keyword unchanged
- **WHEN** the user enters `overdue & #Home` in the Filter view
- **THEN** the query runs as before and the results page's group labels do not read "Overdue"

### Requirement: Phone header actions
Below 768 px a list SHALL show its actions in the shell's bar and its overflow menu, never as a row of controls between the bar and the quick add, so the rule "Nothing between the header and the list" holds at every width. The bar SHALL show at most two visible actions: Process the Inbox in the Inbox, the Ask action in Today when the assistant is available, and otherwise the duration filter where the view has one; Display mode, "Select tasks", the duration filter when the slots are taken, and the rest SHALL be in the overflow. The Inbox SHALL have no subtitle: its planned tasks without a project are the last group of its list (OpenSpec `web-app`, "Standard views"). An active filter SHALL show as one chip with a clear control in the bar, not above the list.

#### Scenario: Today on a phone
- **WHEN** Today with ten tasks opens on a 390×844 phone
- **THEN** the only chrome above the first task is the bar and the quick add, Display mode is in the bar's overflow, and at least four tasks are visible without scrolling

#### Scenario: Inbox on a phone
- **WHEN** the Inbox with eight tasks and three planned tasks without a project opens on a phone
- **THEN** the bar shows "Process 8" as a visible action, no subtitle, and no row of controls under it; the three planned tasks are the folded group at the end of the list

#### Scenario: Filter chip in the bar
- **WHEN** the user picks "Quick wins" from the filter in the bar of a project on a phone
- **THEN** the list is filtered and one chip with a clear control appears in the bar, and the first task keeps its place under the quick add

### Requirement: Swipe actions on rows
On a touch screen a task row SHALL offer two swipe actions: swiped right it completes the task (reopens it in Completed); swiped left it opens a Schedule sheet with Today, Tomorrow, Next week, Pick a day and Someday. A swipe SHALL take the row only after the finger has moved 12 px horizontally with less than 8 px of vertical movement, so a vertical scroll never moves a row. While the finger moves the row SHALL translate up to 120 px and show the action's edge as a soft tint with its icon and word; the action SHALL be named at 64 px, fire at 96 px or on a release faster than 0.5 px per ms past 64 px, and be cancelled, with the row returning within the ui duration, when the finger releases or returns under 32 px. A completed swipe SHALL run the completion feedback and SHALL offer the same Undo as a tap on the checkbox. Every swipe action SHALL also be the first items of the row's menu ("Complete", "Schedule…"), so no action needs a gesture. Rows SHALL NOT swipe while any row is ticked, when the user cannot edit the task, in the Trash, on board cards and calendar blocks, while the inline editor is open, or with a fine pointer. A long press without movement SHALL still start the drag. The first time a touch device shows a list with a swipeable row the first row SHALL peek 40 px to the right and back once (not under reduced motion) and a toast SHALL say what swiping does; the cue SHALL run once per device. Each action is the same local operation as its menu item, so it works offline and converges like any other edit.

#### Scenario: Swipe right completes
- **WHEN** the user drags a Today row 100 px to the right and lifts the finger
- **THEN** the task is completed with the completion feedback, the Undo toast appears, and the counts update

#### Scenario: Short pull cancels
- **WHEN** the user drags a row 50 px to the right and lets go
- **THEN** the row returns to its place and nothing changes

#### Scenario: Flick commits
- **WHEN** the user flicks a row to the right, releasing at 70 px after a fast move
- **THEN** the task is completed as with a full pull

#### Scenario: Swipe left schedules
- **WHEN** the user drags a row 100 px to the left and lifts, then taps Tomorrow in the sheet
- **THEN** the task's do-on date is tomorrow, the row re-sorts or leaves the view, and Undo is offered

#### Scenario: Vertical scroll is never a swipe
- **WHEN** the user drags a finger 30 px down and 10 px sideways over a row
- **THEN** the list scrolls and the row does not move

#### Scenario: No swipe during a selection
- **WHEN** two rows are ticked and the user drags a third row to the right
- **THEN** the row does not move and the list scrolls or nothing happens, and the row's checkbox ticks it on tap

#### Scenario: The menu has the same actions
- **WHEN** a touch user opens a row's menu
- **THEN** its first items are Complete and Schedule…, which do what the two swipes do

#### Scenario: Viewer cannot swipe
- **WHEN** a member with the viewer role drags a row of a shared project to the right
- **THEN** the row does not move and the task stays open

#### Scenario: Offline swipe
- **WHEN** the device is offline and the user swipes a row right
- **THEN** the task is completed at once, the op is queued, and other devices converge on the completed state after sync

#### Scenario: The cue runs once
- **WHEN** a touch device shows its first list with tasks
- **THEN** the first row peeks right and back once and a toast explains the two swipes, and no later list on that device shows the cue

#### Scenario: Reduced motion cue
- **WHEN** reduced motion is requested on a device that has not seen the cue
- **THEN** the toast is shown and no row moves
