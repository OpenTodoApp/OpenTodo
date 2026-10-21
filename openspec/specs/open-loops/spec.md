# open-loops Specification

## Purpose
Open Loops is OpenTodo's own task method, inspired by GTD. It defines the method's vocabulary, the per-user choice of how prominent the method is in the app (not at all, as a companion, or as the home screen), the Loop home, the references from screens to the method's documentation, the context-label convention and the starter setup.

## Requirements

### Requirement: One method vocabulary
The product SHALL define the Open Loops vocabulary once, with a stable id per term:
- five moves: `catch`, `clarify`, `place`, `do`, `review`
- seven principles
- seven Places: `inbox`, `next`, `waiting`, `scheduled`, `later`, `someday`, `projects`
- three Rhythms: `daily`, `weekly`, `monthly`
- three Horizons: `step`, `project`, `area`

Each term SHALL have a name and a one-sentence description in every shipped language. The app, the in-app Help and the site bundle SHALL show the same name for the same id. Ids SHALL be added but never renamed or reused. The method's name SHALL appear untranslated as a product name.

#### Scenario: Same words everywhere
- **WHEN** the interface language is German and the user opens the Loop home, then the Help page for Clarify
- **THEN** the tile and the Help page title show the same German name for the move `clarify`

#### Scenario: A missing translation
- **WHEN** a term has no translation in the interface language
- **THEN** the English name is shown and the i18n check fails the build

### Requirement: How you work preference
Each user SHALL have a "How you work" preference with the values:
- `lists` (Lists only)
- `companion`
- `first` (Open Loops first)

It SHALL be stored as an additive field of the user's personal preferences, written as an operation and synced to every device of that user only. It SHALL be editable offline, take effect at once on the editing device, and converge by last-writer-wins. A missing, empty or unknown value SHALL read as `lists`, and the client SHALL keep the stored value unchanged. The preference SHALL be included in the JSON export. Changing it SHALL never write an operation on a task, project, label or view.

#### Scenario: Existing account after upgrade
- **WHEN** a user who had the app before this change opens it
- **THEN** the preference reads `lists`, the sidebar, start view and screens are exactly as before, and no operation is written

#### Scenario: Change on one device
- **WHEN** the user picks Open Loops first on the laptop while the phone is offline, and the phone later syncs
- **THEN** both devices show the Open Loops sidebar, the phone without a reload

#### Scenario: Concurrent choices
- **WHEN** device A picks `companion` and device B picks `first`, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives the value `coach`
- **THEN** it behaves as `lists` and writes no operation

#### Scenario: Switching back loses nothing
- **WHEN** a user in `first` mode switches to `lists`
- **THEN** every task, project, label and view is unchanged, and Next, Waiting and the Loop home stay reachable from the More group, the palette and their shortcuts

### Requirement: Choosing how you work in Settings
Settings → Account (the You group) SHALL offer "How you work" as three choices. Each choice SHALL have a one-sentence description and a "Learn the method" link that opens the method overview in the Help panel. Choosing Open Loops first SHALL also offer, on that device only, to make the Loop home the start view. Declining SHALL leave the device's start view unchanged. Below the choices the section SHALL offer "Show the start guide again", which opens the start guide of the `first-run` capability at its first step on this device; it writes nothing until a step of the guide writes, and closing the guide leaves the preference as it was.

#### Scenario: Pick Open Loops first
- **WHEN** the user picks Open Loops first and accepts "Open on the Loop home on this device"
- **THEN** the app opens on the Loop home on this device on the next launch, and the other devices keep their own start view

#### Scenario: Learn before choosing
- **WHEN** the user activates "Learn the method" in Settings
- **THEN** the method overview opens in the Help panel beside Settings, and closing it returns to the unchanged choice

#### Scenario: Start guide again
- **WHEN** a user in `companion` mode activates "Show the start guide again" and closes the guide on its first step
- **THEN** the preference still reads `companion`, no operation was written, and Settings is as it was

### Requirement: References to the method
In `companion` and `first` modes, every screen that serves a move SHALL name that move as a link beside its page title (on phones, in the subtitle line of the page bar), with the method's name in its text alternative:

| Screen | Move |
| --- | --- |
| Inbox | Catch |
| Inbox triage | Clarify |
| Next | Do |
| Waiting | Place |
| Someday | Place |
| Weekly review, Daily check, Monthly look | Review |
| Loop home | the method's overview |

The link SHALL open the method page for that move in the Help panel beside the screen, without leaving it. It SHALL add no row and no action to the page header. In `lists` mode no screen SHALL show it.

#### Scenario: Companion user on the Inbox
- **WHEN** a user in `companion` mode opens the Inbox
- **THEN** beside the title it reads "Catch · Open Loops", and activating it opens the Catch page in the Help panel while the Inbox stays as it was

#### Scenario: Lists only
- **WHEN** a user in `lists` mode opens the Inbox or the weekly review
- **THEN** no method link is shown and the page header is exactly as before this change

#### Scenario: Offline
- **WHEN** the installed app is offline and the user activates the Clarify link in triage
- **THEN** the Clarify page opens from the in-app Help

### Requirement: Loop home
The app SHALL offer a Loop home at `/loop`, reachable in every mode from the More group, the command palette and `g` then `Shift+L`, and as a start view. It SHALL show, in this order:

1. **Capture**: a quick-add field that creates tasks in the Inbox, the same quick add as the Inbox view, with the Catch move's count beside it on the rail. Capturing SHALL keep focus in the field for the next entry. The field is the only chrome above the rail besides the page header.
2. **The rail**: one element per move, in method order (Catch, Clarify, Place, Do, Review), each with live counts computed on the device and each being one link that opens the screen doing that move:

| Move | Counts | Opens |
| --- | --- | --- |
| Catch | open Inbox tasks | the Inbox |
| Clarify | open Inbox tasks | triage |
| Place | projects without a next action, stalled projects | the review's project walk |
| Do | next actions, waiting tasks, and the next actions per context as chips | Next |
| Review | the Daily check, the weekly review and the Monthly look, each with when it was last done and whether it is due, and whether the day is closed | the due rhythm, else the weekly review |

   Counts SHALL be shown as numerals with tabular figures, with the unit as secondary text. Catch, Clarify and Place at zero SHALL show a done mark in the success colour instead of the numeral; no move SHALL have a disabled control. Exactly one move SHALL be marked as the **next move** and SHALL carry the page's only primary action; the next move is the first of Clarify (Inbox not empty), Place (a project without a next action), Review (a rhythm due), Do (a next action exists), else Catch. Context chips on Do SHALL open Next. The Review move SHALL carry one more line, "Day: closed <time>" when the day was closed on the user's local date and "Close the day" otherwise, which opens Close the day; it is a plain link, never the primary action, and it SHALL NOT change which move is next.
3. **Today's focus** from the Daily check, with the usual row actions and an indicator of how many of the chosen tasks are done. When no focus is chosen the section SHALL offer to start the Daily check.
4. **The Loop pulse** (see the Loop pulse requirement).

When the Inbox is empty, every project has a next action and no rhythm is due, the page SHALL show a short closed-loop line above the rail and no "nothing to decide" wording. The page SHALL work offline and reflect remote changes live. The rail SHALL read in order as a list for assistive technology, each move with its name as a heading, and SHALL wrap into one column at 360 px without horizontal scrolling. The loading state SHALL have the same shape as the loaded page.

#### Scenario: Morning on the Loop home
- **WHEN** the Inbox holds 7 tasks, two projects have no next action, and the weekly review was finished 9 days ago
- **THEN** Catch and Clarify show 7, Place shows 2, Review shows the weekly review as due, Clarify is the next move and carries the one primary action, and activating it opens triage on the first Inbox task

#### Scenario: Capture from the Loop home
- **WHEN** the user types "Call the plumber" into the capture field and presses Enter
- **THEN** the task is in the Inbox, Catch and Clarify show one more, and focus stays in the field

#### Scenario: Next move moves on
- **WHEN** the Inbox is emptied in triage and the user returns to the Loop home while one project has no next action
- **THEN** Clarify shows a done mark, Place is the next move and carries the primary action "Walk your projects"

#### Scenario: Loop closed
- **WHEN** the Inbox is empty, every project has a next action and the Daily check and weekly review are not due
- **THEN** the page shows the closed-loop line, Catch, Clarify and Place show done marks, Do is the next move, and no control is disabled

#### Scenario: A capture from another device
- **WHEN** the Loop home is open and another device captures a task into the Inbox, which syncs
- **THEN** the Catch and Clarify counts rise by one without a reload

#### Scenario: Keyboard path
- **WHEN** the user presses `g` then `Shift+L`, then Tab past the capture field to the Do move and Enter
- **THEN** the Next view opens

#### Scenario: Phone width
- **WHEN** the Loop home is shown on a 360 px wide screen
- **THEN** the capture field, the five moves as one column, Today's focus and the Loop pulse are shown without horizontal scrolling

#### Scenario: Close the day from the Review move
- **WHEN** the day is not closed, the Inbox is empty and the user activates "Close the day" on the Review move
- **THEN** the Close the day screen opens on its first step, and after closing it the Review move reads "Day: closed" with the time while the Inbox's done mark and the next move are unchanged

#### Scenario: Day closed on another device
- **WHEN** the Loop home is open on the laptop and the phone closes the day, which syncs
- **THEN** the Review move's line changes to "Day: closed" without a reload

### Requirement: Context labels
A label whose name starts with `@` SHALL be a context. The Next view and the Loop home SHALL group by context. A task with no context SHALL be grouped under "Anywhere", and a task with several contexts SHALL be listed under each. Contexts SHALL remain ordinary labels in every other respect. With end-to-end encryption, the grouping SHALL be computed from the names decrypted on the device.

#### Scenario: Two contexts
- **WHEN** a next action has the labels `@calls` and `@errands`
- **THEN** it is listed under both groups in Next, and completing it removes it from both

#### Scenario: Not a context
- **WHEN** a label is named `urgent`
- **THEN** it does not create a group in Next

### Requirement: Starter setup
When the user chooses Open Loops (`companion` or `first`) at first run or in Settings, and the user has no context label, the app SHALL offer to create the context labels `@home`, `@computer`, `@calls` and `@errands`, with names in the interface language. They SHALL be created as ordinary label operations, offline-capable, and SHALL skip any label of the same name that already exists. Declining SHALL create nothing. No state about the offer SHALL be stored: it is shown only at the moment of choosing.

#### Scenario: Accept the starter labels
- **WHEN** a user without labels picks Companion and accepts the starter labels while offline
- **THEN** the four labels exist on this device at once and on the user's other devices after the next sync

#### Scenario: A label of the same name exists
- **WHEN** the user has a label `home` without `@` and accepts the starter labels
- **THEN** the four `@` labels are created and `home` is unchanged

#### Scenario: Contexts already exist
- **WHEN** the user already has a label `@office` and picks Open Loops first
- **THEN** no starter offer is shown

### Requirement: Loop pulse
Below Today's focus the Loop home SHALL show a Loop pulse: four figures about the last 14 local days, computed on the device from the local task rows at the time they are shown, with nothing written (no op, no synced cache) and nothing sent to the server. They SHALL be shown offline, and because every device holds the same rows after sync, every device SHALL show the same figures; there is nothing to converge. The figures are:

- **Done this week**: completed tasks in the current week, and the difference to last week, both as the statistics capability defines completed and the two periods.
- **Caught, decided**: of the live tasks created in the last 14 days, how many no longer qualify for the Inbox (they have a project, are a subtask, or are completed), as "n of m". Deleted tasks count in neither number.
- **Oldest in Inbox**: the age in whole local days of the oldest live open Inbox task, shown as "empty" when the Inbox is empty, and marked as a caution when older than seven days.
- **Completed per day**: completions per local day for the 14 days as one single-hue bar strip whose heights share one scale, with the current week's total printed and each day's value available on hover or focus, plus a text alternative that lists the fourteen values.

The pulse SHALL link to the Statistics screen. With end-to-end encryption the figures are the same, since none of them reads content.

#### Scenario: Agrees with Statistics
- **WHEN** the Loop home says 9 done this week and the user opens Statistics for this week
- **THEN** Statistics shows completed 9

#### Scenario: Caught and decided
- **WHEN** 19 tasks were created in the last 14 days, 11 of them now have a project or are completed, and one of the remaining 8 was deleted
- **THEN** the pulse shows "11 of 18"

#### Scenario: Inbox age
- **WHEN** the oldest open Inbox task was created 9 local days ago
- **THEN** the pulse shows 9 days with the caution mark, and shows "empty" once the Inbox is cleared

#### Scenario: Offline and nothing sent
- **WHEN** the Loop home is opened without a connection and used
- **THEN** the pulse is shown from local data and no request other than ordinary sync leaves the device
