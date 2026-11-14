# Spec Delta

## ADDED Requirements

### Requirement: The cold-start skeleton holds the phone's chrome
Below 768 px, while the app does not yet know the account, the loading skeleton SHALL show the shell's top bar and the bottom tab bar as empty shapes in the places and sizes the shell gives them, including the top and bottom safe areas, so that nothing moves when the shell replaces the skeleton. The shapes SHALL take their frame from the same definition as the real bar and tab bar. A day page's bar (Today, Upcoming) SHALL have no hairline in the skeleton, as it has none in the shell. The shapes SHALL show only where the shell will show them: on a device that was signed in, and not on a screen without the tab bar (a task page, the routine editor, the capture screen, an invitation or a reset link). They SHALL carry no text and no name for assistive technology; the skeleton's rows keep the one loading status. From 768 px the skeleton is unchanged. This is presentation only: it reads no task data and is the same offline.

#### Scenario: Cold start on a phone
- **WHEN** a signed-in user opens the Inbox at 360 px and the account is not yet known
- **THEN** the skeleton shows a bar at the top and a tab bar with four tab shapes at the bottom, and when the app appears the bar, its menu button and every tab are at the same position and size

#### Scenario: A phone with safe areas
- **WHEN** the same start happens on a phone with a 59 px top inset and a 34 px bottom inset
- **THEN** the skeleton's bar starts below the top inset and its tab bar ends above the bottom inset, exactly as the shell's do

#### Scenario: Today
- **WHEN** the app starts on Today at 360 px
- **THEN** the skeleton's bar has no hairline, and its height is the height of Today's bar

#### Scenario: A device that was never signed in
- **WHEN** the app opens at 360 px in a browser that holds no account
- **THEN** the skeleton shows rows only, and the sign-in screen follows

#### Scenario: A screen without the tab bar
- **WHEN** the app starts on the capture screen or a task page at 360 px
- **THEN** the skeleton shows rows only

#### Scenario: A wide window
- **WHEN** the app starts at 1280 px
- **THEN** the skeleton shows rows and no bar or tab bar
