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
Each user SHALL have a "How you work" preference with the values, each shown with its label:
- `lists` (Simple lists)
- `companion` (Lists with method hints)
- `first` (Full Open Loops method)

It SHALL be stored as an additive field of the user's personal preferences, written as an operation and synced to every device of that user only. It SHALL be editable offline, take effect at once on the editing device, and converge by last-writer-wins. A missing, empty or unknown value SHALL read as `lists`, and the client SHALL keep the stored value unchanged. The preference SHALL be included in the JSON export. Changing it SHALL never write an operation on a task, project, label or view.

#### Scenario: Existing account after upgrade
- **WHEN** a user who had the app before this change opens it
- **THEN** the preference reads `lists`, the sidebar, start view and screens are exactly as before, and no operation is written

#### Scenario: Change on one device
- **WHEN** the user picks Full Open Loops method on the laptop while the phone is offline, and the phone later syncs
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

#### Scenario: Labels changed, values kept
- **WHEN** a user who chose "Companion" before this change opens Settings → How you work
- **THEN** "Lists with method hints" is selected, the stored value is still `companion`, and no operation was written

### Requirement: Choosing how you work in Settings
Settings → Account (the You group) SHALL offer "How you work" as three choices. Each choice SHALL have a one-sentence description in plain words and a "What is Open Loops?" link that opens the method overview in the Help panel. Choosing Full Open Loops method SHALL also offer, on that device only, to make the Loop home the start view, saying what the Loop home shows. Declining SHALL leave the device's start view unchanged. Below the choices the section SHALL offer "Show the start guide again", which opens the start guide of the `first-run` capability at its first step on this device; it writes nothing until a step of the guide writes, and closing the guide leaves the preference as it was.

#### Scenario: Pick Open Loops first
- **WHEN** the user picks Full Open Loops method and accepts "Open on the Loop home on this device"
- **THEN** the app opens on the Loop home on this device on the next launch, and the other devices keep their own start view

#### Scenario: Learn before choosing
- **WHEN** the user activates "What is Open Loops?" in Settings
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

1. **The Next step card**: one sentence naming the next move's reason and one primary button that performs it. The next move is the first of:
   - Clarify, when the Inbox is not empty ("n things in the Inbox are waiting.");
   - Place, when a project has no next action ("n projects have no next action.");
   - Review, when a rhythm is due (naming the rhythm);
   - Do, when a next action exists ("n next actions are ready.");
   - else Catch ("Your loops are closed.").

   The button SHALL open the move in place, except that a due rhythm opens its own screen. It SHALL be the page's only primary action.
2. **The stepper**: one item per move, in method order (Catch, Clarify, Place, Do, Review). Each item holds the move's name and either its live count, computed on the device, or a done mark in the success colour when the move has no work. Review instead shows whether a rhythm is due. Only the next move SHALL carry the accent, and no item SHALL be a disabled control.

   | Move | Count | Open in place |
   | --- | --- | --- |
   | Catch | open Inbox tasks | the capture field labelled "Catch into the Inbox", the latest captures and a link to the Inbox |
   | Clarify | open Inbox tasks | the triage card on the first Inbox task with its decisions, and how many are left |
   | Place | projects without a next action | those projects, each with a field to add a next action, then the stalled projects and a link to the review's project walk |
   | Do | next actions | Today's focus with how many of the chosen tasks are done (or an offer to start the Daily check), then next actions by context, and a link to Next |
   | Review | rhythms due | the Daily check, the weekly review and the Monthly look, each with when it was last done and whether it is due and opening its screen, then "Day: closed <time>" or "Close the day" |

   Counts SHALL be numerals with tabular figures, with the unit in the accessible name. ← and → SHALL move between items while the stepper has focus, and Enter or a click SHALL open the item's move below the stepper or close it when it is open.
3. **The Loop pulse line** (see the Loop pulse requirement).
4. **The open move**, when one is open.

Opening a move SHALL set the address to `/loop/<move id>` without leaving the page. Back SHALL close it, and opening that address SHALL show the Loop home with that move open. At `/loop` no move is open. Below 768 px the stepper SHALL be one row without horizontal scrolling, and an open move SHALL take the screen as a page with Back. The page SHALL have no capture field outside Catch; quick add keeps creating in the Inbox from the Loop home.

The page SHALL work offline and reflect remote changes live. The stepper SHALL read in order as a list for assistive technology, each item named with its move and count. The loading state SHALL have the same shape as the loaded page.

#### Scenario: Morning on the Loop home
- **WHEN** the Inbox holds 7 tasks, two projects have no next action, and the weekly review was finished 9 days ago
- **THEN** the Next step card reads "7 things in the Inbox are waiting." with the primary button "Clarify", the stepper shows Catch and Clarify with 7, Place with 2 and Review as due, only Clarify carries the accent, and activating the button opens the triage card on the first Inbox task below the stepper at `/loop/clarify`

#### Scenario: Capture from the Loop home
- **WHEN** the user opens Catch, types "Call the plumber" into "Catch into the Inbox" and presses Enter
- **THEN** the task is in the Inbox, Catch and Clarify show one more, the capture is first among the latest captures, and focus stays in the field

#### Scenario: Next move moves on
- **WHEN** the Inbox is emptied in the Clarify move while one project has no next action
- **THEN** Clarify shows a done mark, the Next step card reads "1 project has no next action." with "Walk your projects", and Place carries the accent

#### Scenario: Loop closed
- **WHEN** the Inbox is empty, every project has a next action and the Daily check and weekly review are not due, and a next action exists
- **THEN** Catch, Clarify and Place show done marks, the Next step card names Do with "Go to Next", and no control is disabled

#### Scenario: A capture from another device
- **WHEN** the Loop home is open and another device captures a task into the Inbox, which syncs
- **THEN** the Catch and Clarify counts rise by one without a reload, and the Next step card's sentence follows

#### Scenario: Keyboard path
- **WHEN** the user presses `g` then `Shift+L`, tabs to the stepper, presses → three times and Enter
- **THEN** the Do move opens below the stepper at `/loop/do`, and Back closes it with focus on the Do item

#### Scenario: Phone width
- **WHEN** the Loop home is shown on a 360 px wide screen and the user opens Place
- **THEN** the Next step card and the five moves in one row are shown without horizontal scrolling, and Place opens as a page with Back

#### Scenario: Close the day from the Review move
- **WHEN** the day is not closed, the Inbox is empty and the user opens Review and activates "Close the day"
- **THEN** the Close the day screen opens on its first step, and after closing it the Review move reads "Day: closed" with the time, while the Inbox's done mark and the next move are unchanged

#### Scenario: Day closed on another device
- **WHEN** the Loop home is open on the laptop with Review open, and the phone closes the day, which syncs
- **THEN** the Review move's line changes to "Day: closed" without a reload

#### Scenario: Deep link
- **WHEN** the user opens `/loop/place` directly
- **THEN** the Loop home is shown with Place open below the stepper

#### Scenario: Add a next action in place
- **WHEN** Place lists "Kitchen renovation" without a next action and the user types "Call the tiler" into its field and presses Enter
- **THEN** the task is created in that project as its next action, the project leaves the list, and Place's count drops by one

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
Below the stepper the Loop home SHALL show the Loop pulse as one quiet line: done this week, caught and decided, and oldest in Inbox, with the caution mark when that is past seven days. Activating the line SHALL open the full pulse in a popover (a sheet below 640 px). The full pulse holds four figures about the last 14 local days, computed on the device from the local task rows at the time they are shown, with nothing written (no op, no synced cache) and nothing sent to the server. They SHALL be shown offline, and because every device holds the same rows after sync, every device SHALL show the same figures; there is nothing to converge. The figures are:

- **Done this week**: completed tasks in the current week, and the difference to last week, both as the statistics capability defines completed and the two periods.
- **Caught, decided**: of the live tasks created in the last 14 days, how many no longer qualify for the Inbox (they have a project, are a subtask, or are completed), as "n of m". Deleted tasks count in neither number.
- **Oldest in Inbox**: the age in whole local days of the oldest live open Inbox task, shown as "empty" when the Inbox is empty, and marked as a caution when older than seven days.
- **Completed per day**: completions per local day for the 14 days as one single-hue bar strip whose heights share one scale, with the current week's total printed and each day's value available on hover or focus, plus a text alternative that lists the fourteen values.

The full pulse SHALL link to the Statistics screen. With end-to-end encryption the figures are the same, since none of them reads content.

#### Scenario: Agrees with Statistics
- **WHEN** the Loop home's pulse line says 9 done this week and the user opens Statistics for this week
- **THEN** Statistics shows completed 9

#### Scenario: Caught and decided
- **WHEN** 19 tasks were created in the last 14 days, 11 of them now have a project or are completed, and one of the remaining 8 was deleted
- **THEN** the pulse shows "11 of 18"

#### Scenario: Inbox age
- **WHEN** the oldest open Inbox task was created 9 local days ago
- **THEN** the pulse line shows 9 days with the caution mark, and shows "empty" once the Inbox is cleared

#### Scenario: Offline and nothing sent
- **WHEN** the Loop home is opened without a connection and used
- **THEN** the pulse is shown from local data and no request other than ordinary sync leaves the device

#### Scenario: Details on demand
- **WHEN** the user activates the pulse line
- **THEN** a popover shows the four figures, the 14-day strip with its text alternative and a link to Statistics, and Esc closes it with focus back on the line
