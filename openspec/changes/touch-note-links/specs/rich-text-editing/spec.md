## ADDED Requirements

### Requirement: Links open by touch
On a touch screen, a tap on a link in the notes editor SHALL open the link instead of placing the caret: a web or mail address in a new tab (in the native apps, the system browser), and a link to a note, task or project in the app, as Ctrl or Cmd and a click does with a mouse. A tap SHALL be one finger that lifts within 500 ms and within 10 px of where it touched, on the same link. A finger that moves or stays down, two fingers, and mouse, pen and keyboard input SHALL keep the editor's other rules, and a tap on text that is not a link SHALL still start editing. Only addresses the editor renders as links SHALL open (http, https and mailto, and the app's `?note=`, `?task=` and `?project=` addresses).

#### Scenario: Tap a web link
- **WHEN** the user taps the link "the ferry" (https://example.com/ferry) in a task's notes on a phone
- **THEN** the address opens in a new tab, or in the phone's browser in the apps, and the notes are not put into editing

#### Scenario: Tap a link to a project
- **WHEN** the user taps a link to the project "Lisbon" in a task's notes on a phone
- **THEN** the project opens in the app

#### Scenario: Scroll over a link
- **WHEN** the user's finger lands on a link and moves 30 px before lifting
- **THEN** nothing opens and the editor handles the touch as before

#### Scenario: A mouse click
- **WHEN** the user clicks a link in the notes with a mouse, without Ctrl or Cmd
- **THEN** the caret is placed in the link and nothing opens
