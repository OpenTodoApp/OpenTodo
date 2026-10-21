# weekly-review Specification

## Purpose
A guided weekly review built into the app: four steps with live data (get clear, look back, next actions, look ahead), a record of when the last review was finished, and a sidebar marker when a review is due.

## Requirements

### Requirement: Review steps
The weekly review SHALL offer seven steps in order, grouped into three phases. Each step SHALL show live data and whether it is done.

- **Get clear**
  - Get clear: the Inbox. Done when it is empty.
  - Mind sweep: always done.
- **Get current**
  - Look back: this week's completions and the overdue tasks. Done when nothing is overdue.
  - Waiting: the Waiting view's tasks. Always done.
  - Projects: the project walk. Done when every project in it was reviewed by the user in the last seven days and none is without a next action.
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

### Requirement: Finishing a review
"Finish review" SHALL write `completed_at` on the user's `review` entity (id `me`, personal scope) through the operation log. The Daily check SHALL write `daily_at`, `focus_date` and `focus` on the same entity, and the Monthly look SHALL write `monthly_at`. The entity SHALL sync to every device of the user, SHALL be written offline through the outbox, and SHALL converge per field by last-writer-wins, so the latest finish of each rhythm wins. It is not user-written content and is never encrypted. It SHALL be included in the JSON export and SHALL derive no activity event.

#### Scenario: Finish on one device
- **WHEN** the user finishes a review on the laptop and later opens the phone
- **THEN** both show the same "Last review" time after sync

#### Scenario: Two finishes offline
- **WHEN** two devices finish a review while offline, then sync
- **THEN** every device shows the later of the two times

#### Scenario: Daily and weekly on different devices
- **WHEN** the phone finishes the Daily check and the laptop finishes the weekly review, both offline, then sync
- **THEN** both times are kept on every device

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know the `review` entity or one of its fields
- **THEN** the op is rejected as unknown, the device keeps its local value, and nothing else is affected

### Requirement: Review screen and sidebar marker
The web app SHALL show Review at `/review`, reachable from the sidebar and by `g` then `r`. Review SHALL show one step at a time as a guided sequence. A progress indicator above the step SHALL show the three phases with their steps in order, each step marked done, current or with the count left; every step in the indicator SHALL open that step directly, and the indicator SHALL fit a 375 px wide screen without horizontal scrolling. The current step SHALL be shown in one card with its position and phase ("Step 3 of 7 · Get current"), its title, what is left, a short explanation, its content and its main action; the position SHALL also be available to assistive technology from the indicator. Back and Next buttons below the card SHALL move to the previous and next step, `[` and `]` SHALL do the same, and on the last step Next SHALL be "Finish review". Moving to a step SHALL move focus to its title. Lists inside a step SHALL use the list shortcuts, and the project walk SHALL use its card keys. The Daily check and the Monthly look SHALL be in the header's menu. The sidebar entry SHALL show when the last review was and the markers of the Rhythm markers requirement. The screen SHALL open on the first step that is not done. The screen only reads local rows and writes through the op log, so it works offline and follows changes from other devices as they sync.

#### Scenario: Review due
- **WHEN** the last review was finished nine days ago
- **THEN** the sidebar's Review entry carries a "due" marker and a text alternative, and opening it starts on the first unfinished step

#### Scenario: Keyboard path
- **WHEN** the user presses `g` then `r`, presses `]` until the Projects step is shown, and presses `q`
- **THEN** Review opens, each `]` shows the next step with focus on its title, the project walk shows its first card, and quick add opens scoped to that project

#### Scenario: Jump from the progress indicator
- **WHEN** the user is on the Inbox step and selects the Someday segment in the progress indicator
- **THEN** the Someday step's card is shown with "Step 7 of 7 · Get creative", the indicator marks it current, and focus moves to the step's title

#### Scenario: Phone width
- **WHEN** Review is shown on a 375 px wide screen
- **THEN** all seven steps and the three phase names are visible in the progress indicator without horizontal scrolling, and Back and Next are reachable below the step

#### Scenario: Everything done
- **WHEN** every step is done
- **THEN** the screen says so, "Finish review" is the primary action in the header and on the last step, and finishing shows the time and returns focus to the current step's title

### Requirement: Mind sweep
The Mind sweep step SHALL show a short list of trigger prompts in the interface language (for example "Calls to return", "Things at home to fix", "Promises to someone", "Money and paperwork") and a quick add that captures into the Inbox and keeps focus for the next entry. The prompts SHALL be fixed copy with no data of their own. Captures SHALL be ordinary task creations, offline-capable.

#### Scenario: Rapid capture
- **WHEN** the user types three tasks in a row in Mind sweep, pressing Enter after each
- **THEN** the three tasks are in the Inbox in that order and focus stays in the quick add

### Requirement: Project walk
The Projects step SHALL walk projects one at a time. The walk includes every live, unarchived project in which the user may edit tasks, ordered by the user's last review of it (never reviewed first, then oldest), then by the project's position.

The card SHALL show:
- the project's name
- the first lines of its notes, read-only, as its outcome
- its next action
- its counts of waiting and deferred tasks
- a stalled marker when stalled
- a "without a next action" marker
- when the user last reviewed it

The keys SHALL be:

| Key | Action | Advances |
| --- | --- | --- |
| `r` | mark the project reviewed by writing the user's personal review stamp for it | yes |
| `q` | open quick add scoped to the project, the same key as quick add everywhere; the new task becomes the next action when it qualifies | no |
| Enter | open the project | no |
| `a` | archive the project, only where the user may archive it, through the ordinary op, undoable | yes |
| `j` or Space | skip without marking | yes |
| `k` | go back | — |

The walk SHALL show "n of N", and after the last card a summary of what is still without a next action. Every action SHALL be a visible button with its key, usable by touch at 360 px. A polite live region SHALL announce each card and each outcome.

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

### Requirement: Personal review stamp per project
Marking a project reviewed SHALL write the time on the user's personal preferences for that project. These sync to the user's own devices and never to other members of a shared project, converge by last-writer-wins, and can be written offline. The stamp is not user-written content and is never encrypted. It SHALL be included in the JSON export and SHALL derive no activity event. A server that does not know the field SHALL reject the op as unknown, and the device SHALL keep its local value.

#### Scenario: Shared project reviewed by two members
- **WHEN** the user and Ana both review the shared project Household, the user on Monday and Ana on Thursday
- **THEN** each sees their own stamp, and Ana's review does not mark it reviewed for the user

#### Scenario: Two devices offline
- **WHEN** two devices of the user mark the same project reviewed while offline, then sync
- **THEN** every device shows the later of the two times

### Requirement: Someday step
The Someday step SHALL list the user's Someday tasks, oldest first. For each, `n` SHALL promote the task by clearing its start so it becomes actionable (the list's Someday toggle), `c` SHALL complete it, Delete SHALL trash it, and the usual row keys SHALL work. Each action SHALL be the operation the list writes for the same action.

#### Scenario: Promote a someday task
- **WHEN** the user presses `n` on "Learn to bake bread" in a project with no other open task
- **THEN** the task leaves Someday, becomes that project's next action, and appears in Next

### Requirement: Daily check
The app SHALL offer a Daily check at `/review/daily`, reachable from the Review screen's menu, the Loop home, the command palette and `g` then `Shift+R`. It SHALL show on one page:
- the open Inbox count with "Process the Inbox"
- the overdue tasks
- today's tasks, where `f` toggles a task in or out of today's focus, up to three tasks

"Done for today" SHALL write the time of the daily check on the user's `review` entity. Today's focus SHALL be written there as the local date and the chosen task ids. Both sync to the user's devices only, are written offline, converge by last-writer-wins, are not content, are included in the export, and derive no activity event. A focus whose date is not today SHALL be shown as empty. Completed or deleted tasks SHALL drop out of the focus as it is shown, without a write. "Today" and "the local date" here are the user's logical today (OpenSpec `date-time-preferences`, "Logical today"), so a check finished or a focus chosen after midnight but before the day start belongs to the day being lived.

#### Scenario: Pick a focus
- **WHEN** the user presses `f` on three of today's tasks and then on a fourth
- **THEN** the first three are the focus, the fourth is refused with a message that the focus holds three tasks, and the Loop home lists the three on every device after sync

#### Scenario: Next day
- **WHEN** the focus was chosen yesterday
- **THEN** today's Daily check and the Loop home show no focus until the user picks one

#### Scenario: Done for today
- **WHEN** the user finishes the Daily check on the phone
- **THEN** the laptop's Review marker no longer shows the daily check as due after sync

#### Scenario: Focus kept past midnight
- **WHEN** the day start is `04:00`, the focus was chosen on Wednesday evening and the user opens the Loop home at 01:00 on Thursday
- **THEN** the focus is still shown, and it is empty once 04:00 has passed

### Requirement: Monthly look
The app SHALL offer a Monthly look at `/review/monthly`, reachable from the Review screen's menu, the Loop home and the command palette, with three steps:
- **Areas:** each live top-level project that has child projects, with its number of child projects and how many of them are without a next action or stalled.
- **Old someday:** Someday tasks created more than 90 days ago, with the Someday step's keys.
- **Trend:** the last four weeks' completed, created and slipped counts, with the definitions of Statistics.

"Finish monthly look" SHALL write its time on the user's `review` entity with the same sync, offline, export and convergence rules as the weekly review.

#### Scenario: Areas with stalled children
- **WHEN** the top-level project Home has four child projects, one stalled and one without a next action
- **THEN** Areas lists Home with "4 projects, 2 need attention", and opening it lists the two

### Requirement: Rhythm markers
A rhythm SHALL be due as follows:
- the weekly review, when its last finish is more than seven days ago or never
- the Monthly look, when it is more than 30 days ago or never
- the Daily check, when it was not done on the user's logical today (OpenSpec `date-time-preferences`, "Logical today")

The sidebar Review entry SHALL carry the weekly marker in every mode. In `companion` and `first` modes it SHALL also carry the monthly marker. In `first` mode it SHALL also carry the daily marker. Each marker SHALL have a text alternative naming the rhythm. In `first` mode, the first time the app is opened on a logical day on which the Daily check is not done, a toast SHALL offer to start it, at most once per logical day per device.

#### Scenario: Lists only
- **WHEN** a user in `lists` mode has never done a Daily check or Monthly look and finished the weekly review yesterday
- **THEN** the Review entry carries no marker

#### Scenario: Open Loops first in the morning
- **WHEN** a user in `first` mode opens the app on a new day
- **THEN** a toast offers "Start your daily check", and dismissing it means it does not return on that device that day

#### Scenario: Daily check done in the evening, app open after midnight
- **WHEN** a user in `first` mode with a day start of `04:00` finished the Daily check on Wednesday evening and uses the app at 00:30 on Thursday
- **THEN** the Review entry carries no daily marker and no toast is shown until 04:00 has passed
