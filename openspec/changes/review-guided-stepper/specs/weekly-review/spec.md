## MODIFIED Requirements

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
