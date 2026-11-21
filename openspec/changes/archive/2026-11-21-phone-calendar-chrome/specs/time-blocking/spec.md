# Spec Delta

## ADDED Requirements

### Requirement: Calendar chrome on a phone
Below 768 px every view of the Calendar destination (Day, Week, Month, Plan and Year) SHALL have at most two rows of chrome above its content: the shell's bar, with the period as its title, and one row that holds the way to move in time and the view. The row SHALL show Previous, Today and Next at its start and, at its end, one button that shows the current view's name and opens Day, Week, Month, Plan and Year as a menu, the current view announced as checked. Choosing a view from the menu SHALL keep the anchor date, as the switch does from 768 px. Previous, Next and Today SHALL keep their accessible names ("Previous week", "Next week", "Today" and the like per view) and their shortcuts, and the views SHALL keep theirs. The view button's accessible name SHALL contain the view's name it shows, and the menu SHALL follow the menu keyboard model (arrow keys, Enter, Escape returning focus to the button). Every control of the row SHALL be at least 44 × 44 px on a touch screen, and the row SHALL stay one row at 360 px in every interface language. Where the account has other calendars, the Calendars toggle SHALL be an item of the page's menu below 768 px, checked while their events show, and SHALL NOT be in the row. A project's Calendar layout SHALL show the calendar's controls as the same single row in the project's header, followed by its Calendar options button. From 768 px the header SHALL be as it was: the five-part view switch and the Calendars button beside Previous, Today and Next. The row is device chrome only: it reads and writes no task data, and works offline like the views.

#### Scenario: The Week on a small phone
- **WHEN** the Week is open on a 360 px touch screen
- **THEN** the bar shows the week's dates as its title, the row under it shows Previous week, Today, Next week and a button reading "Week", and the first day starts directly under that row

#### Scenario: Choose a view
- **WHEN** the user taps "Week" in the row while the week of 18 November is shown, and chooses Month
- **THEN** November opens, and the button reads "Month"

#### Scenario: Choose a view by keyboard
- **WHEN** the user focuses the view button in the Day, presses Enter, ArrowDown and Enter
- **THEN** the Week opens on the same date

#### Scenario: Move in time
- **WHEN** the user taps Next month in the Month's row on a phone, then Today
- **THEN** the next month is shown, then the current month, and `[`, `]` and `t` do the same from a keyboard

#### Scenario: Other calendars
- **WHEN** a user with a subscribed calendar opens the Day on a phone and opens the "…" menu
- **THEN** the menu has Calendars, checked, and choosing it hides the calendar's events on this device; the row under the bar still holds only Previous, Today, Next and the view

#### Scenario: A project's Calendar layout
- **WHEN** the project "Home" shows its Calendar layout on a 360 px screen
- **THEN** the calendar's controls are one row of the project's header: Previous, Today, Next, the view button and Calendar options

#### Scenario: Wider screens
- **WHEN** the Week is open on a 768 px or a 1280 px screen
- **THEN** the header shows Previous, Today, Next and the switch Day, Week, Month, Plan, Year, as before
