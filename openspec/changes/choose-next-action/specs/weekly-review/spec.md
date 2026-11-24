## MODIFIED Requirements

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
| `q` | open quick add scoped to the project, the same key as quick add everywhere; the new task becomes the next action when it qualifies, or one of the project's open tasks is chosen as its next action (open-loops "Choosing a next action among a project's open tasks") | no |
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
