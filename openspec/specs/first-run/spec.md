# first-run Specification

## Purpose
Defines what a person sees the first time they sign in on a server: a short in-app start that produces a first task, a chosen appearance and an understanding of where things are, without a tour overlay.

## Requirements

### Requirement: Three-step first run
The first time an account opens the app, the Inbox SHALL show a three-step card instead of the empty state:
1. Add your first task: quick add focused, with one example.
2. How do you want to work: Lists only, Companion or Open Loops first, each with one sentence and a "Learn the method" link that opens the method overview in the Help panel. Companion is preselected. Light, dark or system follows as a second row of the same step.
3. Install the app, or skip.

Each step SHALL be skippable. Skipping the second step SHALL leave the "How you work" preference unwritten, so it reads as `lists`. The card SHALL leave after the third step or Skip all, and it SHALL never return on that account. The card's state SHALL be stored with the account's preferences so a second device does not show it again after sync. Choosing Companion or Open Loops first SHALL show the starter setup offer of the `open-loops` capability. Choosing Open Loops first SHALL offer to open on the Loop home on this device.

#### Scenario: Complete the first run
- **WHEN** a new owner adds a task, picks Companion, declines the starter labels, picks dark and skips installing
- **THEN** the card closes, the task is in the Inbox, the preference is `companion`, the app is dark, and reopening the app on another device after sync shows no card

#### Scenario: Open Loops first from the start
- **WHEN** a new user picks Open Loops first and accepts the starter labels and the Loop home as start view
- **THEN** the sidebar shows the Open Loops destinations, the four context labels exist, and the next launch on this device opens the Loop home

#### Scenario: Skip all
- **WHEN** the user activates Skip all on the first step
- **THEN** the card closes for good, the normal empty state is shown, and the preference reads `lists`

#### Scenario: Learn before choosing
- **WHEN** the user activates "Learn the method" on the second step
- **THEN** the method overview opens in the Help panel and the card keeps its step and the task already added

### Requirement: Sample project
The first run SHALL offer a "Show me around" action that creates one sample project with six tasks demonstrating a date, a deadline, labels, a subtask, a repeat and a note, created as ordinary operations so it syncs and can be deleted like any project. The offer SHALL appear once.

#### Scenario: Create and delete the sample
- **WHEN** the user activates Show me around and later deletes the sample project
- **THEN** the project and its tasks go to the Trash like any other project, and no sample is offered again

### Requirement: Empty states name the action first
Every empty state SHALL show an icon, one sentence naming the action and one button that performs it; a keyboard hint SHALL follow in a second line only on fine-pointer devices.

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today" with an "Add a task" button and no key hint

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop
- **THEN** the same text and button are shown with "Press q to add a task" beneath

### Requirement: Welcome note for the owner
The first time the owner opens a server whose owner account was created in the last seven days and has no task yet, the app SHALL show a dialog thanking them for installing OpenTodo, with a link to open an issue on GitHub, a link to star the repository, a Buy Me a Coffee button and one primary button that closes it. Every link SHALL open in a new tab and SHALL load nothing from the linked site into the app. Closing the dialog in any way SHALL record the preference `welcome` as `seen` through the op log, and the dialog SHALL never show again on any device of that account. It SHALL NOT show to members, on a demo instance, or for an account that already had tasks when the app opened or is older than seven days. The same links SHALL be available in Help and in Settings → About, where the owner can open the note again.

#### Scenario: New server
- **WHEN** the owner creates the owner account on a new server and the app opens
- **THEN** the dialog "Thanks for installing OpenTodo" is shown with the issue, star and coffee links, and after "Start using OpenTodo" it is gone, also after a reload and on the owner's phone after sync

#### Scenario: Invited member
- **WHEN** a member invited by the owner signs in for the first time
- **THEN** no welcome dialog is shown

#### Scenario: Upgraded server
- **WHEN** the owner of a server that already has tasks upgrades to a version with the welcome note
- **THEN** no welcome dialog is shown
