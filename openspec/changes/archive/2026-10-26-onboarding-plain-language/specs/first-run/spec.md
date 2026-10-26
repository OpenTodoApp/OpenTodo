## MODIFIED Requirements

### Requirement: Three-step first run
The first time an account opens the app, the Inbox SHALL show its ordinary page (header, quick add, the rows or the empty view) and, over it, a **start guide** with three steps, one at a time:
1. Add your first task: a quick add inside the step (the same quick add as the Inbox's), focused, with one example; the task lands in the Inbox behind the guide, and adding one moves the guide on.
2. How do you want to work: one plain sentence saying what Open Loops is and that the choice can be changed later in Settings, then Simple lists, Lists with method hints or Full Open Loops method, each with one plain sentence saying what changes on screen, and a "What is Open Loops?" link that opens the method overview in the Help panel. Lists with method hints is preselected. Light, dark or system follows as a second row of the same step.
3. Install the app, or skip.

The guide SHALL be a centred dialog from 640 px up and a bottom sheet below it, leaving the Inbox visible behind, and SHALL never be a row of the list. Each step SHALL be skippable, and the guide SHALL be closable at any step in every way an overlay closes (Close, Escape, a tap on the scrim, "Skip all"); closing it in any way counts as finishing it. Skipping or closing on the second step SHALL leave the "How you work" preference unwritten, so it reads as `lists`. Finishing, in any way, SHALL be stored with the account's preferences as an ordinary operation, so the guide never returns on its own on that account, on a second device after sync included. The guide SHALL open only after the owner's welcome note, when that is shown, has been closed, and SHALL never open on a demo instance. Choosing Lists with method hints or Full Open Loops method SHALL show the starter setup offer of the `open-loops` capability. Choosing Full Open Loops method SHALL offer to open on the Loop home on this device. The guide SHALL work offline: its only writes are the operations above, which converge by last-writer-wins.

Settings → Account → How you work SHALL end with a "Start guide" row: its title, one line naming what the guide covers ("Add a first task, choose how you work, install the app"), its state ("Finished" or "Not finished", from the synced `first_run` preference), and an "Open the start guide" button. The button SHALL go to the Inbox and open the guide there at its first step, on this device, without writing anything until a step writes; closing it SHALL return nowhere else and write nothing. The row SHALL follow the card's row layout (label and description on the left, the action on the right) and SHALL be reachable with Tab.

#### Scenario: Complete the first run
- **WHEN** a new owner adds a task, picks Lists with method hints, declines the starter labels, picks dark and skips installing
- **THEN** the guide closes, the task is in the Inbox behind it the whole time, the preference is `companion`, the app is dark, and reopening the app on another device after sync shows no guide

#### Scenario: Open Loops first from the start
- **WHEN** a new user picks Full Open Loops method and accepts the starter labels and the Loop home as start view
- **THEN** the sidebar shows the Open Loops destinations, the four context labels exist, and the next launch on this device opens the Loop home

#### Scenario: Skip all
- **WHEN** the user activates Skip all on the first step
- **THEN** the guide closes for good, the Inbox's empty view is shown, and the preference reads `lists`

#### Scenario: Closed with Escape
- **WHEN** the user presses Escape on the second step without choosing
- **THEN** the guide closes, the preference reads `lists`, and it does not return on any device of the account

#### Scenario: Learn before choosing
- **WHEN** the user activates "What is Open Loops?" on the second step
- **THEN** the method overview opens in the Help panel and the guide keeps its step and the task already added

#### Scenario: On a phone
- **WHEN** a new account opens the Inbox on a 390×844 screen
- **THEN** the guide is a sheet at the bottom of the screen with one step, the page header and the Inbox are visible above it, and the sheet is at most two thirds of the screen high

#### Scenario: After the welcome note
- **WHEN** a new owner opens a fresh server
- **THEN** the welcome note is shown first, and the start guide opens after it is closed

#### Scenario: Shown again from Settings
- **WHEN** a user who finished the guide opens Settings → Account → How you work and activates "Open the start guide" in the "Start guide" row, which reads "Finished"
- **THEN** the Inbox opens with the guide at its first step over it, adding a task there puts it in the Inbox behind the guide, and closing the guide writes nothing

#### Scenario: Not finished yet
- **WHEN** a user who closed the welcome note but has not finished the guide opens How you work
- **THEN** the "Start guide" row reads "Not finished" and its button opens the guide over the Inbox

## ADDED Requirements

### Requirement: Plain words in the start guide
The start guide and the offers it shows SHALL be understandable without Help. A method term (the method's name, a move, a principle, a context, the Loop home, the Places) SHALL appear only with a plain explanation in the same sentence or as the text of a link to its Help page. Option labels SHALL describe what the person gets, never an internal mode name. A test SHALL fail when a start guide string uses a term from the method vocabulary without one of these.

#### Scenario: A newcomer reads the second step
- **WHEN** a person who has never heard of Open Loops reaches "How do you want to work?"
- **THEN** the step says in one sentence what Open Loops is, each choice says what changes on screen in everyday words, and no label reads "Companion", "Lists only" or "Open Loops first"

#### Scenario: The starter labels offer
- **WHEN** the person picks Lists with method hints and has no context label
- **THEN** the offer to create the four context labels says, in the same sentence, that a context is where or how a task can be done and that any label starting with @ is one

#### Scenario: Same words in every language
- **WHEN** the interface language is German
- **THEN** the second step shows the translated labels, intro and offers, and `make i18n-check` reports no missing or untranslated entry for them
