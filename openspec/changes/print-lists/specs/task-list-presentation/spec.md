## ADDED Requirements

### Requirement: Printing a list
Printing a list page (the Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Completed, a project or a saved view in the list layout, a label, a location) with the browser's Print SHALL print the page's title with its line under it and the list as the screen shows it: its group headers in their order, its folded groups and parents still folded, subtasks indented, and each row with its checkbox as an empty circle, its time, its whole title, its marks and the properties of its column (the date, the project when the list shows projects, the labels) on any page at least as wide as A4 or Letter with the browser's default margins. Nothing else SHALL be printed: no sidebar, bar, tab bar, quick add, page, group or row action, drag handle, toast, assistant, panel or open overlay. The printout SHALL be black text on white in every theme, high contrast and custom theme included, without fills, tints or shadows; the priority colours of the checkbox and the priority mark MAY stay. Every row of the list SHALL be printed, over as many pages as it takes, none cut by the screen's scrolling area or skipped because it was off screen; a row SHALL NOT be split across two pages and a group header SHALL be kept on the page of its first row. The list's menu (the page header's "…", the Inbox menu, the label menu, and the project menu and a saved view's menu in the list layout) SHALL end with "Print…", which opens the same print once the menu has closed; inside the Android or iOS app, whose web view does not print, the item SHALL be left out. Printing reads only what the screen shows, writes nothing and works offline.

#### Scenario: Printing Today in a dark theme
- **WHEN** the user, in the dark theme, presses Ctrl+P on Today with three tasks under Earlier and twelve under Today
- **THEN** the print shows "Today" with its date, "Earlier" and "Today" with their counts and the rows beneath them in black on white, and no sidebar, quick add, action button or dark fill

#### Scenario: A long project over several pages
- **WHEN** the user prints a project of 60 tasks in two sections, one task with two subtasks
- **THEN** every task is printed, over the pages it takes, each section header on the page of its first row, the subtasks indented under their parent, and no row split between two pages

#### Scenario: Folded groups stay folded
- **WHEN** the user prints Today with Earlier folded
- **THEN** the print shows the "Earlier" header with its count and none of its rows

#### Scenario: Print… from the menu
- **WHEN** the user opens the "…" menu of Someday in the installed app and chooses "Print…"
- **THEN** the menu closes and the browser's print opens for Someday's list

#### Scenario: A row keeps its column on paper
- **WHEN** the user prints Upcoming on A4 paper and a task has a date, a project and the label "work"
- **THEN** its row shows the date, the project and "work" beside its title, as on a wide screen, not the phone's one-line row
