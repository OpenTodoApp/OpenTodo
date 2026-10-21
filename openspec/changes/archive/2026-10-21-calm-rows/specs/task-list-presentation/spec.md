# Spec Delta

## MODIFIED Requirements

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
Row metadata SHALL use three styles only: tone text for the date and the deadline (the deadline with its icon), label chips, and neutral chips for estimate, subtask progress, comment count, attachment count, project and origin. The origin chip SHALL show an icon for the kind from the app's icon set (a link for `url` and `issue`, an at sign for `email`, a download arrow for `import`) and the external id, else the URL's host; when the origin has a URL the chip SHALL be a link that opens it in a new tab without passing the referrer, and activating it SHALL not open the task. Counts SHALL use tabular figures, not a monospace face. The project SHALL not be shown in the Inbox or inside that project's view.

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

## ADDED Requirements

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
