# Spec Delta

## ADDED Requirements

### Requirement: Popover triggers toggle
Activating the control that opened an anchored popover (a facet part, a picker trigger, a menu button) while that popover is open SHALL close it in one step, and it SHALL NOT reopen. Activating it while closed SHALL open it. A click on the trigger SHALL never count as a click outside the popover.

#### Scenario: Second click closes
- **WHEN** the When popover was opened from the Do on part and the user clicks the Do on part again
- **THEN** the popover closes, stays closed, and focus is on the Do on part

#### Scenario: No flicker
- **WHEN** the user clicks the Do on part ten times in a row
- **THEN** the popover is open after every odd click and closed after every even click, and is never closed and reopened within one click

#### Scenario: Keyboard toggle
- **WHEN** focus is on a facet part whose popover is open and the user presses Enter on the part
- **THEN** the popover closes and focus stays on the part

### Requirement: Do on segment
The Do on segment of the When popover SHALL show, in order: quick choices (Today, Tomorrow, This weekend, Next week, No date), each with the date it means; one date field that shows the chosen date in words in the user's date format, accepts typed dates and relative words, and previews what it understood before it is committed; a month calendar that is visible without opening anything; an "Add time" control that reveals a time field with suggested times; the Evening switch; and, only when a time is set, one line naming the time zone behaviour ("Floating time" or "Fixed to <city>") with a Change control. The segment SHALL NOT contain a clear button of its own (Clear is in the popover's footer), and SHALL NOT show the zone as a button-styled value.

#### Scenario: Pick tomorrow in one click
- **WHEN** the user opens the Do on part of an undated task and chooses Tomorrow
- **THEN** the task is due tomorrow, and the When line reads "Tomorrow"

#### Scenario: Typed date with a preview
- **WHEN** the user types `fri` into the date field
- **THEN** a line under the field reads the next Friday's date in words before Enter is pressed, and Enter sets it

#### Scenario: Dates in words
- **WHEN** the user's date format is day-month and the task is due 2026-10-22
- **THEN** the date field reads "Thu 22 Oct" and no field shows `10/22/2026`

#### Scenario: Adding a time
- **WHEN** the user chooses "Add time" and then the suggestion 09:00
- **THEN** the task is due at 09:00, the zone line "Floating time · Change" appears, and "Add time" is replaced by the time field and "Remove time"

#### Scenario: No zone without a time
- **WHEN** the task is due on a date with no time
- **THEN** the segment shows no zone line and no hint about time zones

### Requirement: Conversation tabs stay reachable
The tab bar of Comments, Activity, History and Time SHALL stay pinned under the panel header once the user has scrolled down to it, so the tabs are reachable without scrolling back up. Switching tabs SHALL keep the tab bar at the same position on screen, show the new tab's content from its start under the bar, and SHALL NOT make the panel jump, even when the new tab is shorter than the old one. The panel SHALL remain one scroll region.

#### Scenario: Switch while reading a long thread
- **WHEN** the user has scrolled the panel to the 10th of 14 comments and chooses Activity
- **THEN** the tab bar is still under the header at the same position, the Activity entries start right under it, and nothing else in the panel moves

#### Scenario: Short tab does not pull the page
- **WHEN** the user switches from Comments with 14 comments to Activity with 3 entries
- **THEN** the tab bar does not move on screen and the space below the entries is empty panel, not a jump

#### Scenario: Tabs pinned
- **WHEN** the user scrolls the panel past the subtasks into the comments
- **THEN** the tab bar stays visible directly under the sticky header

## MODIFIED Requirements

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity, History and Time as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. The task's created and completed times SHALL be the first entries of Activity. The tab bar SHALL follow "Conversation tabs stay reachable".

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

#### Scenario: Activity starts with the lifecycle
- **WHEN** the user opens the Activity tab of a completed task
- **THEN** its created time and its completed time are the first entries
