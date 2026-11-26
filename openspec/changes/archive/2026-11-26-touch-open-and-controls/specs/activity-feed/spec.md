# Spec Delta

## ADDED Requirements

### Requirement: A tap opens a feed row by touch
On a device whose main pointer is coarse, a tap on a row of the feed SHALL open what the entry is about: its task, or its project when the entry has no task. A tap on a link or a button inside the row SHALL do only what that control does. With a fine pointer a click SHALL select the row and a double click open it, as before. Opening a row writes nothing; the row is marked seen as the feed already marks it.

#### Scenario: Tap a row on a phone
- **WHEN** on a touch phone a person taps the text of the entry "Bob commented on Get three quotes"
- **THEN** the task "Get three quotes" opens

#### Scenario: Tap the project inside the row
- **WHEN** a person taps the project's name inside that row
- **THEN** the project opens, and the task does not

#### Scenario: A mouse
- **WHEN** a person clicks the row once with a mouse
- **THEN** the row is selected and nothing opens
