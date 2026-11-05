# Spec Delta

## MODIFIED Requirements

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Inbox, Today and Upcoming in the user's primary destination order (`appearance-preferences` "Primary destination order"), then Search. With no stored order that is Inbox, Today, Upcoming and Search. Search is not a destination and SHALL stay last, and the bar SHALL NOT gain further destinations. The phone drawer opens from the shell bar's menu button (see "Phone drawer"). The bar SHALL mark the current tab in the strong text tone rather than the accent, and a floating add button at the bottom right above the bar SHALL open quick add as a bottom sheet with the keyboard up. The bar and the button SHALL hide while a sheet is open and on the task page, which has its own bar with Back and the next and previous task. Tabs SHALL be at least 48 px tall and SHALL respect the bottom safe area. Every list SHALL reserve the add button's footprint under its last row, so the button never covers a row or its metadata. While the content scrolls down by more than 24 px the bar SHALL minimise to its icons and the button SHALL slide out below it; on any scroll up, at the end of the content, or 600 ms after scrolling stops, both SHALL return. When the system requests reduced motion the bar and the button SHALL stay in place at all times. This is presentation only; every action behind the bar and the button is the same local operation offline.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Four tabs
- **WHEN** the Inbox is open on a 390 px phone and the user has never reordered destinations
- **THEN** the tab bar shows Inbox, Today, Upcoming and Search in that order, Inbox is marked current in the strong text tone, and no tab is in the accent colour

#### Scenario: Tab order follows the sidebar
- **WHEN** the user moved Today above Inbox in Settings → Appearance and opens the app on a 390 px phone
- **THEN** the tab bar shows Today, Inbox, Upcoming and Search, Search is last, and no tab is in the accent colour

#### Scenario: Add from anywhere
- **WHEN** the user taps the floating add button in Upcoming
- **THEN** quick add opens as a bottom sheet with its field focused and the Upcoming default date applied, and the list stays visible above the keyboard

#### Scenario: The last row is readable
- **WHEN** a list of twenty tasks is scrolled to its end on a 390×844 phone
- **THEN** the last row's title and metadata are fully visible above the add button and the tab bar, and nothing is under the button

#### Scenario: The bar minimises while reading
- **WHEN** the user scrolls a long list down by 100 px on a phone without reduced motion
- **THEN** the tab bar shows only its icons at a smaller height and the add button is off screen, and a scroll up of any distance brings both back at full size

#### Scenario: Reduced motion keeps the bar
- **WHEN** reduced motion is requested and the user scrolls a long list down
- **THEN** the tab bar and the add button do not move
