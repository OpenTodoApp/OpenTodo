## ADDED Requirements

### Requirement: The row's menu on touch
On the Habits screen, a row's "More ways to check in" menu button SHALL be visible at all times on a device without hover, and SHALL appear with the row's hover or keyboard focus on a device with hover. The menu's items and what they write are unchanged.

#### Scenario: A phone
- **WHEN** the Habits screen is open on a phone with the habit "Read"
- **THEN** the row shows its menu button beside the check-in button without any hover, and a tap opens the menu with Check in and Log the tiny version

#### Scenario: A mouse
- **WHEN** the Habits screen is open on a desktop and the pointer is not over a row
- **THEN** the row's menu button is not shown, and it appears when the pointer or the keyboard focus enters the row
