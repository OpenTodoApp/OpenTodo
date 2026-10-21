# first-run Specification

## Purpose
Defines what a person sees the first time they sign in on a server: a short in-app start that produces a first task, a chosen appearance and an understanding of where things are, without a tour overlay.

## Requirements

### Requirement: Three-step first run
The first time an account opens the app, the Inbox SHALL show its ordinary page (header, quick add, the rows or the empty view) and, over it, a **start guide** with three steps, one at a time:
1. Add your first task: a quick add inside the step (the same quick add as the Inbox's), focused, with one example; the task lands in the Inbox behind the guide, and adding one moves the guide on.
2. How do you want to work: Lists only, Companion or Open Loops first, each with one sentence and a "Learn the method" link that opens the method overview in the Help panel. Companion is preselected. Light, dark or system follows as a second row of the same step.
3. Install the app, or skip.

The guide SHALL be a centred dialog from 640 px up and a bottom sheet below it, leaving the Inbox visible behind, and SHALL never be a row of the list. Each step SHALL be skippable, and the guide SHALL be closable at any step in every way an overlay closes (Close, Escape, a tap on the scrim, "Skip all"); closing it in any way counts as finishing it. Skipping or closing on the second step SHALL leave the "How you work" preference unwritten, so it reads as `lists`. Finishing, in any way, SHALL be stored with the account's preferences as an ordinary operation, so the guide never returns on its own on that account, on a second device after sync included. The guide SHALL open only after the owner's welcome note, when that is shown, has been closed, and SHALL never open on a demo instance. Choosing Companion or Open Loops first SHALL show the starter setup offer of the `open-loops` capability. Choosing Open Loops first SHALL offer to open on the Loop home on this device. The guide SHALL work offline: its only writes are the operations above, which converge by last-writer-wins.

The guide SHALL be re-openable from Settings → Account → How you work ("Show the start guide again"), at its first step, on this device, without writing anything until a step writes.

#### Scenario: Complete the first run
- **WHEN** a new owner adds a task, picks Companion, declines the starter labels, picks dark and skips installing
- **THEN** the guide closes, the task is in the Inbox behind it the whole time, the preference is `companion`, the app is dark, and reopening the app on another device after sync shows no guide

#### Scenario: Open Loops first from the start
- **WHEN** a new user picks Open Loops first and accepts the starter labels and the Loop home as start view
- **THEN** the sidebar shows the Open Loops destinations, the four context labels exist, and the next launch on this device opens the Loop home

#### Scenario: Skip all
- **WHEN** the user activates Skip all on the first step
- **THEN** the guide closes for good, the Inbox's empty view is shown, and the preference reads `lists`

#### Scenario: Closed with Escape
- **WHEN** the user presses Escape on the second step without choosing
- **THEN** the guide closes, the preference reads `lists`, and it does not return on any device of the account

#### Scenario: Learn before choosing
- **WHEN** the user activates "Learn the method" on the second step
- **THEN** the method overview opens in the Help panel and the guide keeps its step and the task already added

#### Scenario: On a phone
- **WHEN** a new account opens the Inbox on a 390×844 screen
- **THEN** the guide is a sheet at the bottom of the screen with one step, the page header and the Inbox are visible above it, and the sheet is at most two thirds of the screen high

#### Scenario: After the welcome note
- **WHEN** a new owner opens a fresh server
- **THEN** the welcome note is shown first, and the start guide opens after it is closed

#### Scenario: Shown again from Settings
- **WHEN** a user who finished the guide activates "Show the start guide again" in Settings → Account → How you work
- **THEN** the guide opens at its first step over Settings, and closing it writes nothing

### Requirement: Sample project
The first run SHALL offer a "Show me around" action that creates one sample project with six tasks demonstrating a date, a deadline, labels, a subtask, a repeat and a note, created as ordinary operations so it syncs and can be deleted like any project. The offer SHALL appear once.

#### Scenario: Create and delete the sample
- **WHEN** the user activates Show me around and later deletes the sample project
- **THEN** the project and its tasks go to the Trash like any other project, and no sample is offered again

### Requirement: Welcome note for the owner
The first time the owner opens a server whose owner account was created in the last seven days and has no task yet, the app SHALL show a dialog thanking them for installing OpenTodo, with a link to open an issue on GitHub, a link to join the OpenTodo Discord server, a link to star the repository, a Buy Me a Coffee button and one primary button that closes it. Every link SHALL open in a new tab and SHALL load nothing from the linked site into the app. Closing the dialog in any way SHALL record the preference `welcome` as `seen` through the op log, and the dialog SHALL never show again on any device of that account. It SHALL NOT show to members, on a demo instance, or for an account that already had tasks when the app opened or is older than seven days. The same links SHALL be available in Help and in Settings → About, where the owner can open the note again.

#### Scenario: New server
- **WHEN** the owner creates the owner account on a new server and the app opens
- **THEN** the dialog "Thanks for installing OpenTodo" is shown with the issue, Discord, star and coffee links, and after "Start using OpenTodo" it is gone, also after a reload and on the owner's phone after sync

#### Scenario: Discord link in the note
- **WHEN** the owner activates the Discord row of the welcome note
- **THEN** the Discord invite opens in a new tab, the note stays open, and the app has made no request to Discord before or after the activation

#### Scenario: Invited member
- **WHEN** a member invited by the owner signs in for the first time
- **THEN** no welcome dialog is shown

#### Scenario: Upgraded server
- **WHEN** the owner of a server that already has tasks upgrades to a version with the welcome note
- **THEN** no welcome dialog is shown
