# Spec Delta

## MODIFIED Requirements

### Requirement: Review steps
The weekly review SHALL offer seven steps in order, grouped into three phases. Each step SHALL show live data and whether it is done.

- **Get clear**
  - Get clear: the Inbox. Done when it is empty.
  - Mind sweep: always done.
- **Get current**
  - Look back: this week's completions and the overdue tasks. Done when nothing is overdue.
  - Waiting: the Waiting view's tasks. Always done.
  - Projects: the project walk. Done when no project in the walk is due for review ("Review interval per project") and none is without a next action.
  - Look ahead: the next seven days. Always done.
- **Get creative**
  - Someday: always done.

Steps SHALL be computed from local rows and work offline. A task captured during the review SHALL make Get clear not done again until it is processed.

#### Scenario: Inbox step
- **WHEN** the Inbox holds three open tasks
- **THEN** Get clear lists them with the usual row actions, shows "3 to process" and offers to open the Inbox; it reads as done once the three are moved, completed or trashed

#### Scenario: Overdue step
- **WHEN** two tasks are overdue
- **THEN** Look back shows this week's completed count and the two tasks; completing one with `c` or giving it a new date removes it from the step

#### Scenario: A capture during the sweep
- **WHEN** Get clear is done and the user adds "Call the dentist" in Mind sweep
- **THEN** the task is in the Inbox and Get clear shows "1 to process" again

#### Scenario: Waiting step
- **WHEN** two tasks are assigned to Ana and one is blocked
- **THEN** Waiting lists the three tasks grouped as the Waiting view groups them, and opening one shows its comments so the user can follow up

#### Scenario: Projects step with a monthly project
- **WHEN** every project was reviewed this week except "Car", which is reviewed every month and was last reviewed 12 days ago
- **THEN** the Projects step reads as done

### Requirement: Project walk
The Projects step SHALL walk projects one at a time. The walk includes every live, unarchived project in which the user may edit tasks and that is due for review for the user ("Review interval per project"), ordered by the user's last review of it (never reviewed first, then oldest), then by the project's position.

The card SHALL show:
- the project's name
- the first lines of its notes, read-only, as its outcome
- its next action
- its counts of waiting and deferred tasks
- a stalled marker when stalled
- a "without a next action" marker
- when the user last reviewed it
- its review interval ("Every week", "Every 2 weeks", "Every month", "Every quarter")
- "In maintenance" when the project is in maintenance

The keys SHALL be:

| Key | Action | Advances |
| --- | --- | --- |
| `r` | mark the project reviewed by writing the user's personal review stamp for it | yes |
| `q` | open quick add scoped to the project, the same key as quick add everywhere; the new task becomes the next action when it qualifies | no |
| Enter | open the project | no |
| `a` | archive the project, only where the user may archive it, through the ordinary op, undoable | yes |
| `e` | choose the review interval: every week, 2 weeks, month, quarter, or paused | no |
| `m` | put the project in maintenance or end it, only where the user may change the project's fields, undoable | no |
| `j` or Space | skip without marking | yes |
| `k` | go back | — |

The walk SHALL show "n of N". After the last card it SHALL show:
- a summary of what is still without a next action
- how many projects are not due yet and how many are paused, with "Review them too", which adds them to the end of this walk only

Every action SHALL be a visible button with its key, usable by touch at 360 px. A polite live region SHALL announce each card and each outcome.

#### Scenario: Add a next action, then mark reviewed
- **WHEN** the card for Garage shows "No next action", the user presses `q`, types "Buy shelf brackets", then presses `r`
- **THEN** the task is created in Garage, the card showed it as the next action before advancing, and Garage is stamped as reviewed now

#### Scenario: Resume on another device
- **WHEN** the user marks four of eleven projects reviewed on the laptop, then opens the review on the phone after sync
- **THEN** the phone's walk starts with the seven projects not reviewed in the last seven days

#### Scenario: Shared project the user cannot edit
- **WHEN** the user is a viewer of a shared project
- **THEN** that project is not in the walk

#### Scenario: Archive offline
- **WHEN** the user archives a project from the walk while offline
- **THEN** the project is archived locally at once, the walk advances, and the op is sent when the connection returns

#### Scenario: Only due projects
- **WHEN** the user has twelve projects, "Car" is reviewed every quarter and was reviewed a month ago, "Old ideas" is paused, and the other ten were last reviewed eight days ago
- **THEN** the walk shows "1 of 10", and after the last card reads "2 not due yet, 1 of them paused" with "Review them too"

#### Scenario: Change the interval from the card
- **WHEN** on the card for "Car" the user presses `e` and chooses "Every quarter", then presses `r`
- **THEN** the card shows "Every quarter", Car is stamped as reviewed, and it is not in the walk again until its quarter has passed

## ADDED Requirements

### Requirement: Review interval per project
Each user SHALL be able to give each project a review interval: every week, every 2 weeks, every month, every quarter, or paused. It SHALL be stored as the additive field `review_every` on the user's personal preferences for that project, with the values `week`, `2weeks`, `month`, `quarter` and `paused`.

Reading rules:
- An empty, missing or unknown value SHALL read as `week`, and the client SHALL keep the stored value unchanged.

Sync and storage:
- The field SHALL sync to the user's own devices and never to other members of a shared project.
- It SHALL be written offline and converge by last-writer-wins.
- It is not user-written content and is never encrypted.
- It SHALL be included in the JSON export and SHALL derive no activity event.

A project SHALL be due for review for the user when:
- it was never reviewed by the user, or
- the user's logical today is on or after the review date: the logical day of the user's last review stamp, plus 7 days (week), 14 days (2 weeks), one calendar month (month) or three calendar months (quarter). A month added to a day that the target month lacks SHALL land on that month's last day.

A paused project SHALL never be due.

Due-ness SHALL be computed on the device from the synced stamp and interval, with no write. The interval SHALL be changeable from the walk card and from a "Review every…" submenu in the project menu. In `lists` mode the menu item SHALL be shown only when a value other than the default is stored. Changing it SHALL write one operation and offer Undo.

#### Scenario: Monthly review date
- **WHEN** "Car" is reviewed every month and the user last reviewed it on 31 January
- **THEN** it is due from the last day of February in the user's logical days, offline too

#### Scenario: Shared project, personal rhythm
- **WHEN** the user sets the shared project "Household" to every month and Ana keeps it weekly
- **THEN** Household is due for Ana every week and for the user every month, and neither choice reaches the other's devices

#### Scenario: Two devices offline
- **WHEN** the phone sets "Car" to every quarter and the laptop sets it to paused, both offline, and both sync
- **THEN** every device of the user shows the value written with the greater timestamp

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know `review_every`
- **THEN** the op is rejected as unknown, the device keeps its local value, and the walk on this device uses it
