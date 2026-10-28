## ADDED Requirements

### Requirement: Schedule in the sidebar
The sidebar SHALL offer a Schedule section between its scroller and its footer, folding like a sidebar group, closed until the user opens it and remembered on the device. Open, it SHALL show the current time and today's timed tasks and timed calendar events that have not ended, in start order, marking the one in progress, at most five, with a link to the Day calendar that counts the rest. A task SHALL open in the side panel where the page has one, an event SHALL open its details. The section SHALL not scroll on its own and SHALL not show in the icon rail or the phone drawer.

#### Scenario: Keeping the day in sight
- **WHEN** at 10:05 a user with tasks at 08:00, 10:00 (an hour) and 14:00 and an event at 12:00 opens Schedule
- **THEN** it reads "Now 10:05" and lists the 10:00 task marked as now, the 12:00 event and the 14:00 task, and stays visible while the projects scroll

#### Scenario: Opening a task beside the list
- **WHEN** the user clicks the 14:00 task in Schedule while the Inbox is open
- **THEN** the task opens in the side panel next to the Inbox

#### Scenario: More than fits
- **WHEN** seven timed tasks are still ahead today
- **THEN** five are listed and the link reads "2 more today" and opens the Day calendar

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** Schedule shows the tasks and the cached events of today, and asks for no events while no subscription is known on the device
