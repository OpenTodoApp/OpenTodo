## ADDED Requirements

### Requirement: Today at a glance
Below 768 px, Today in the phone UI SHALL show up to three tiles under its title and above its list: Done today, a ring of the tasks completed today out of those and the day's open tasks; Up next, the first open task of today at a time still ahead, or when none is, the day's first open task without a time; and Late, the number of tasks from earlier days. Tapping Up next SHALL open that task's page; tapping Late SHALL scroll the list to the Earlier group. A tile with nothing to show SHALL be left out, and on a day with no task and nothing late there SHALL be no tiles. The tiles SHALL count only what Today lists and the tasks completed today, so they agree with the list, also while Done today is hidden. Presentation only: no tile writes anything.

#### Scenario: A day in progress
- **WHEN** Today lists three tasks at 11:00, 14:00 and 18:00 and one from yesterday, one task was completed this morning, and it is 12:30
- **THEN** Done today reads 1 of 4 with its ring a quarter full, Up next shows the 14:00 task, and Late reads 1

#### Scenario: The evening
- **WHEN** every timed task of the day is past and one task of the day has no time
- **THEN** Up next shows the task without a time

#### Scenario: Late goes to the late tasks
- **WHEN** the user taps Late
- **THEN** the list scrolls to the Earlier group

#### Scenario: An empty day
- **WHEN** Today has no task and nothing is late
- **THEN** no tile is shown

### Requirement: Upcoming's week
Below 768 px, Upcoming in the phone UI SHALL show the next seven days, from tomorrow, as a row of day pills under its title, each with its short weekday, its date and one dot per task up to three. A day with tasks SHALL scroll the list to that day's group when tapped; a day without SHALL be shown without a card and SHALL NOT be offered. Each day's name for assistive technology SHALL start with its visible weekday and date and end with its number of tasks. The counts SHALL be the day groups Upcoming lists.

#### Scenario: A busy tomorrow
- **WHEN** Upcoming lists five tasks tomorrow and one on the third day
- **THEN** tomorrow's pill shows three dots, the third day's one, the other five days none and they cannot be chosen, and tapping tomorrow scrolls to Tomorrow

### Requirement: The look of the phone lists
Below 768 px every phone list SHALL draw a soft light of the accent behind its title that fades before the first rows, and its bar at the top SHALL be clear until the title has scrolled away and then frosted with its hairline. A card of phone rows, a tile, the task page's cards and the date sheet's groups SHALL have the phone card radius (16 px). On the task page the fields without a value SHALL be a grid of tiles, three to a row, each with its icon over its name, opening the same sheets as before. The light SHALL NOT print. Presentation only.

#### Scenario: The title in the light
- **WHEN** Today is open at the top on a phone, in the light or the dark theme
- **THEN** a wash of the accent shows behind the title and is gone before the first group, and the bar at the top has no hairline

#### Scenario: Scrolled away
- **WHEN** the user scrolls Today until its title has left the screen
- **THEN** the bar at the top shows the title over a frosted canvas with its hairline, and the rows never show through it

#### Scenario: Fields to add
- **WHEN** a task with only a date and a project is open on a 360 px phone
- **THEN** Start, Deadline, Reminder and the other fields without a value are tiles three to a row, each opening its sheet when tapped
