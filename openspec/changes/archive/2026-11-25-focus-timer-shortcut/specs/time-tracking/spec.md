## MODIFIED Requirements

### Requirement: Running indicator
While the user has a running entry the sidebar footer (the bar below 768 px) SHALL show an indicator with the elapsed time (ticking every minute, `h:mm` from one hour) and the task's title, a Stop control, and SHALL open the task on activation. When the entry is the running work stretch of the user's Focus session, activation SHALL open the Focus screen with that session instead, and the footer pill's and the phone bar's accessible names SHALL start with "Go to Focus" followed by their visible text, while the icon rail's control, which opens a menu, SHALL keep its tracking name and offer "Go to Focus" as a menu item; below 768 px the bar's control SHALL then open the Focus screen directly rather than the sheet. The indicator SHALL be a keyboard-operable button with the focus ring at every width. It SHALL be announced once to assistive technology when tracking starts and stops, not on every tick, and SHALL show nothing when no entry runs. It reads the device's entry and Focus session and writes nothing, so it behaves the same offline and follows a session started, paused or ended on another device after sync.

#### Scenario: Indicator on a desktop
- **WHEN** an entry on "Write the report" has run for 1 hour and 5 minutes on a 1280 px screen
- **THEN** the sidebar footer reads "1:05 · Write the report" with a Stop control, and Enter on it opens the task panel

#### Scenario: Indicator on a phone
- **WHEN** the same entry runs on a 390 px screen
- **THEN** the bar shows the elapsed time as a control that opens a sheet with the task's title, Open and Stop

#### Scenario: Back to a running Focus session
- **WHEN** a Focus session on "Write the report" has run 5 minutes and the user is on Today at 1280 px
- **THEN** the footer reads "5m · Write the report" as before, its name is "Go to Focus: 5m · Write the report", and Enter on it opens the Focus screen with the running session, while Stop still ends the entry without leaving Today

#### Scenario: Back to Focus on a phone
- **WHEN** the same session runs on a 390 px screen and the user taps the bar's time
- **THEN** the Focus screen opens with the running session and no sheet is shown

#### Scenario: Nothing running
- **WHEN** no entry is running
- **THEN** the footer and the bar show no tracking control
