## ADDED Requirements

### Requirement: Quarter mode
The client SHALL provide a Quarter mode of the Calendar destination, inserted between Month and Plan in the `Day | Week | Month | Quarter | Plan | Year` range switch and reachable from `/quarter[/YYYY-MM-DD]`, from `g` then `q`, from the command palette and from the sidebar's Calendar item when Quarter was the last mode used on the device. It SHALL show the three calendar months of the quarter containing the anchor date (January–March, April–June, July–September or October–December; today when the address carries no date), titled `Q<n> <year>`. Switching to or from Quarter SHALL keep the anchor date, as the other modes do. The view SHALL render from local data and work offline.

#### Scenario: Open a quarter
- **WHEN** the user is on 18 November 2026 in Month and chooses Quarter
- **THEN** the Quarter view opens with October, November and December 2026, titled "Q4 2026", and the focused day stays the 18th

#### Scenario: Quarter boundary
- **WHEN** the address is `/quarter/2027-01-31`
- **THEN** the view shows January, February and March 2027, titled "Q1 2027", even though the anchor is near the end of January

#### Scenario: Reached by keyboard and remembered
- **WHEN** the user presses `g` then `q` and later opens `/calendar` on the same device
- **THEN** Quarter opens both times, while another device signed into the same account still opens its own last-used mode

#### Scenario: Offline
- **WHEN** the installed app is offline and the user opens `/quarter`
- **THEN** the three months render from local tasks, projects and calendar feeds, with no network request required

### Requirement: Three months at a glance
Each of the quarter's three months SHALL be one compact month grid with the same density marks, day capacity dot and event ring as the Year view, computed only over the quarter's dates. Choosing a day SHALL open it in Day and choosing a month's name SHALL open that month in Month. Quarter SHALL be read-only: it SHALL NOT offer task editing, dragging or a capacity bar. On a narrow screen each month SHALL be one touch target opening Month instead of individual day cells.

#### Scenario: A day's density
- **WHEN** a task is due 12 November 2026 and the user views Q4 2026
- **THEN** the 12 November cell of November carries the same density mark it has in Year, and a day in October with no tasks carries none

#### Scenario: Drill down
- **WHEN** the user chooses the 12 November cell and then the "December" heading
- **THEN** Day opens on 12 November 2026 and Month opens on December 2026

#### Scenario: Quarter is read-only
- **WHEN** the user presses Enter on a task's day in Quarter
- **THEN** the Day view of that day opens; no task is moved, completed or edited from Quarter

### Requirement: Quarter navigation and keyboard
Quarter SHALL have the Year's keyboard grid: arrows move the focused day a day or a week, Page Up and Page Down move a month, Home and End move to the first or last day of the focused month, Enter opens the focused day in Day, `[` and `]` step one quarter back or forward keeping the day, `t` returns to today and Escape returns focus to the page header. Every action SHALL be reachable without a pointer, and the calendar shortcut section SHALL name Quarter among the calendar views.

#### Scenario: Step a quarter
- **WHEN** the user views Q4 2026 with 18 November focused and presses `]`, then `[`
- **THEN** Q1 2027 opens with 18 February focused, and `[` brings back Q4 2026 with 18 November focused

#### Scenario: No shortcut conflicts
- **WHEN** the shortcut registry is validated
- **THEN** `g q` is bound only to `go.quarter`, every `quarter.*` view entry names `quarter` in `VIEW_SCOPES`, and `q` still quick-adds a task in the list and calendar views that use it

### Requirement: Quarter is device-local
The last-used calendar mode SHALL stay in device storage, never be written as an op and never be synced. Quarter SHALL read the same local rows as the other calendar views, so two devices with the same synced tasks and the same anchor SHALL draw identical quarters while offline or online; a device whose stored mode is unknown SHALL fall back to Day.

#### Scenario: Same rows, same quarter
- **WHEN** two devices hold the same tasks and open `/quarter/2026-11-18`, one offline and one online
- **THEN** both show the same three months with the same density marks

#### Scenario: Unknown stored mode
- **WHEN** device storage holds a mode this client does not recognise
- **THEN** `/calendar` opens Day rather than failing, and `/quarter` still works
