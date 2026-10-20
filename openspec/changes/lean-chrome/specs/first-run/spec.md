# Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Empty states name the action first
**Reason**: The empty state is a property of every list, not of the first run, and the icon, the second line and the printed key hint it required are chrome the lists no longer carry.
**Migration**: The rule and the copy of every view move to the "Empty views" requirement of `task-list-presentation` (one sentence, one primary action, an optional secondary link; the key in the action's tooltip on fine-pointer devices). The "Empty Today on a phone" and "Empty Today on a desktop" scenarios continue there.
