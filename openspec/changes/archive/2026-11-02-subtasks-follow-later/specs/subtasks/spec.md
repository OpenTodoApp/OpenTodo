## ADDED Requirements

### Requirement: Subtasks in a project's Later group
In a project's list, a subtask SHALL be listed where its top-level task is: when the top-level task is deferred or parked, the whole subtree SHALL be listed in the project's Later group, nested under it as in the rest of the list, each subtask keeping its own dates and chips; when the top-level task is active, a deferred or parked subtask SHALL stay nested under its parent with its "Starts" or "Someday" chip. Parents in the Later group SHALL fold like any other parent. Today, Upcoming, Anytime, Someday and the sidebar counts SHALL keep deciding per task. The placement SHALL be computed on the device from local data without any write, so it is the same offline and follows synced changes on every device.

#### Scenario: Parent deferred to Later
- **WHEN** "Paint the fence" with subtasks "Buy paint" and "Book the sprayer" (due tomorrow) is given a start date next week in the project "Home"
- **THEN** the Home list shows "Paint the fence" under Later with "Buy paint" and "Book the sprayer" indented beneath it, "Book the sprayer" still showing "Tomorrow", and neither subtask remains in the group the parent left

#### Scenario: Deferred subtask of an active parent
- **WHEN** "Plan trip" is due today and its subtask "Renew passport" has a start date next month
- **THEN** the project list shows "Renew passport" indented under "Plan trip" with its "Starts" chip, and the Later group does not list it

#### Scenario: Deferred on another device
- **WHEN** another device defers "Paint the fence" and this device syncs while the project is open
- **THEN** the parent and its subtasks move to Later together without a reload, and nothing is written by this device
