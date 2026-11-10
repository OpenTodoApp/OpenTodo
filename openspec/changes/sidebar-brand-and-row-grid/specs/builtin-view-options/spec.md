## ADDED Requirements

### Requirement: Calm Upcoming
Upcoming's display panel SHALL offer **Later days**: Summarised (the default) or In full. The choice is stored in the user's synced preferences for Upcoming, is written locally first, works offline and converges by last-writer-wins. An empty or unknown value reads as Summarised.

While Summarised is chosen:
- The first three days that have tasks SHALL be listed in full, as today.
- Every later day SHALL be a closed group bar showing the day, its task count and, in the faint tone and cut with an ellipsis, the titles of its first tasks.
- Activating a bar, or → or Enter on it, SHALL open that day in place, and ← SHALL close it again. Opening and closing are kept on the device only, like other collapsed groups.
- `j` and `k` SHALL move between visible rows and closed bars.
- Dropping a dragged task on a closed bar SHALL move the task to that day.
- A day's calendar events, when shown, SHALL count toward neither the three days nor the bar's count.

Everything is presentation only: nothing is written by opening or closing a day.

#### Scenario: A full fortnight
- **WHEN** Upcoming holds tasks on twelve of the next fourteen days and Later days is Summarised
- **THEN** the first three of those days are listed in full, and each of the nine later days is one bar such as "Thu 19 Nov · 6 · Dentist, Pay rent, Call Ana…"

#### Scenario: Open a day
- **WHEN** the user moves to the bar of Thursday with `j` and presses Enter
- **THEN** Thursday's six tasks are listed under its bar, ← closes them again, and the other bars stay closed

#### Scenario: Everything in full
- **WHEN** the user chooses In full in Upcoming's display panel on the laptop
- **THEN** every day is listed in full there at once and on the phone after sync

#### Scenario: Drop on a closed day
- **WHEN** the user drags a task from Tomorrow onto the closed bar of Monday
- **THEN** the task is due Monday, Monday's count rises by one, and Undo puts it back

## MODIFIED Requirements

### Requirement: Display options on Today, Upcoming and the Inbox
Today, Upcoming and the Inbox SHALL offer the display panel of saved views (OpenSpec `custom-views` "Display panel") from a display button among the header's actions, and below 768 px in the phone bar's slot that project and label pages use. The panel SHALL show only these parts:
- **Today:** Rows (One line, Detailed); Group by: Time of day (default), Project, Priority, Label or None; Order by: Due date (default), Priority, Created, Deadline, Title or a sortable Number or Date custom field; the direction under More options (ascending by default); Nest subtasks (off by default).
- **Upcoming:** Rows; Later days: Summarised (default) or In full (see "Calm Upcoming"); Order by with the same choices as Today; the direction; Nest subtasks. No Group by.
- **Inbox:** Rows; Group by: None (default), Due date, Priority or Label; Order by: Manual order (default), Priority, Due date, Created, Deadline or Title; the direction. No Nest subtasks, because the Inbox always shows subtasks under their parent.

None of the three SHALL offer Layout, Completed tasks or Show on rows. Today and Upcoming SHALL offer no Manual order. A choice SHALL apply at once. Rows SHALL show the account's row layout until the view has its own choice. Custom-field orders SHALL be matched and sorted as on a label page (OpenSpec `list-display-options` "Display options on project and label pages").

#### Scenario: Today's choices
- **WHEN** the user opens Display options on Today
- **THEN** Group by offers Time of day, Project, Priority, Label and None with Time of day chosen, Order by offers Due date, Priority, Created, Deadline and Title with Due date chosen, and Nest subtasks is off

#### Scenario: Upcoming has no grouping
- **WHEN** the user opens Display options on Upcoming
- **THEN** the panel shows Rows, Later days with Summarised chosen, Order by, More options and Nest subtasks, and no Group by

#### Scenario: Inbox's choices
- **WHEN** the user opens Display options on the Inbox
- **THEN** Group by offers None, Due date, Priority and Label, Order by offers Manual order first, and no Nest subtasks switch is shown

#### Scenario: Phone
- **WHEN** the user opens Today on a 375 px screen
- **THEN** the display button is in the bar's slots, and the panel opens as a bottom sheet
