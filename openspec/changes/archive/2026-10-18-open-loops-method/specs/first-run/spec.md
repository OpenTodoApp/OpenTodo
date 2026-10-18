# Spec Delta

## MODIFIED Requirements

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
