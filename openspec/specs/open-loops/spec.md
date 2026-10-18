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
Settings → You SHALL offer "How you work" as three choices. Each choice SHALL have a one-sentence description and a "Learn the method" link that opens the method overview in the Help panel. Choosing Open Loops first SHALL also offer, on that device only, to make the Loop home the start view. Declining SHALL leave the device's start view unchanged.

#### Scenario: Pick Open Loops first
- **WHEN** the user picks Open Loops first and accepts "Open on the Loop home on this device"
- **THEN** the app opens on the Loop home on this device on the next launch, and the other devices keep their own start view

#### Scenario: Learn before choosing
- **WHEN** the user activates "Learn the method" in Settings
- **THEN** the method overview opens in the Help panel beside Settings, and closing it returns to the unchanged choice

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
The app SHALL offer a Loop home at `/loop`, reachable in every mode from the More group, the command palette and `g` then `Shift+L`, and as a start view. It SHALL show one tile per move, each with live counts computed on the device and a control that opens the screen doing that move:

| Tile | Counts | Opens |
| --- | --- | --- |
| Catch | open Inbox tasks | quick add |
| Clarify | open Inbox tasks | triage, when the Inbox is not empty |
| Place | projects without a next action, stalled projects | the review's project walk |
| Do | next actions by context, waiting tasks | Next |
| Review | when the daily check and weekly review were last done, and whether each is due | the due rhythm |

Below the tiles it SHALL list today's focus from the daily check, with the usual row actions. It SHALL work offline and reflect remote changes live. The tiles SHALL read in order as a list for assistive technology, and SHALL wrap into one column at 360 px without horizontal scrolling.

#### Scenario: Morning on the Loop home
- **WHEN** the Inbox holds 7 tasks, two projects have no next action, and the weekly review was finished 9 days ago
- **THEN** Catch and Clarify show 7, Place shows 2, Review shows the weekly review as due, and activating Clarify opens triage on the first Inbox task

#### Scenario: A capture from another device
- **WHEN** the Loop home is open and another device captures a task into the Inbox, which syncs
- **THEN** the Catch and Clarify counts rise by one without a reload

#### Scenario: Keyboard path
- **WHEN** the user presses `g` then `Shift+L`, then Tab to the Do tile and Enter
- **THEN** the Next view opens

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
