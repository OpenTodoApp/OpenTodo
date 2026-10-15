# Spec Delta

## MODIFIED Requirements

### Requirement: Day and Week calendar views
The client SHALL provide Day and Week views as one Calendar destination, reachable by `g d` and `g w` and from the sidebar (the last mode remembered per device), using the page header (the range as title, with Today, previous, next and a Day/Week control as actions) and showing a 15-minute grid from a configurable start to end hour (default 06:00 to 22:00, scrollable beyond). The grid SHALL be the content column's own scroller. An open task with a due date and time SHALL appear as a block at that time, sized by its estimate, or by a 30-minute default rendered distinctly when unestimated. Tasks due that day without a time SHALL appear in an "unscheduled" lane above the grid. The list of tasks to plan SHALL open in the shell's panel slot with a design-system picker for its source. Below 640 px the Week SHALL render as a vertical agenda grouped by day. The views SHALL render from the local store and work offline.

#### Scenario: Open the week offline
- **WHEN** the device is offline and the user presses `g w`
- **THEN** the current week renders with every timed task as a block and date-only tasks in each day's lane

#### Scenario: Unestimated block
- **WHEN** a task due today at 10:00 has no estimate
- **THEN** it appears as a 30-minute block with a dashed outline and no duration label, and its tooltip explains the dashed outline and offers Set estimate

#### Scenario: Completed tasks
- **WHEN** a task shown as a block is completed
- **THEN** it leaves the grid and the day's planned total decreases accordingly

#### Scenario: Capacity as a bar
- **WHEN** a day has 2 h 50 planned of 8 h with five unestimated tasks
- **THEN** the lane shows a capacity bar whose tooltip reads "2 h 50 of 8 h planned · 5 tasks without estimate"

#### Scenario: Week on a phone
- **WHEN** the user opens the Week on a 390 px screen
- **THEN** the days are listed vertically with their tasks, and no seven-column grid is rendered

### Requirement: Duration filter
Inbox, Today, Upcoming and project views SHALL offer a duration filter with "Quick wins" (15 minutes or less), "Under 30 min", "Over 1 h" and "Unestimated" from the Filter action in the page header. The options SHALL not be shown while no filter is active; an active filter SHALL be one chip in the header with a clear control. The filter SHALL apply to the local data, persist per device across reloads, and use one duration predicate that later filter features can reuse.

#### Scenario: Quick wins
- **WHEN** the user opens Filter in Today's page header and turns on "Quick wins"
- **THEN** only open tasks with an estimate of 15 minutes or less remain, and a "Quick wins" chip with a clear control is shown in the header

#### Scenario: No filter, no chips
- **WHEN** no duration filter is active in the Inbox
- **THEN** no filter options are rendered above the list

#### Scenario: Filter persists offline
- **WHEN** the device is offline, a filter is active and the page is reloaded
- **THEN** the same filter is still active
