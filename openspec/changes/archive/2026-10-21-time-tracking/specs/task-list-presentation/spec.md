# Spec Delta

## MODIFIED Requirements

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

