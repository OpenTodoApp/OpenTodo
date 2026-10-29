## ADDED Requirements

### Requirement: Add with the pointer in Day and Week
A double-click on an empty part of the Day or Week grid (no block, event, deadline chip or frame title under the pointer) SHALL open the add dialog with that date and the slot's 15-minute start, and a double-click in a day's unscheduled lane SHALL open it with the date only. A right-click on the same places, or a long press of 500 ms on touch, SHALL open a menu at that place with Add task here… and the entries other calendar features add there. A fine pointer SHALL see a faint highlight of the 15-minute slot under it. `q` in Day and Week SHALL open the same dialog for the focused day without a time, so no addition needs a pointer. The task SHALL be created locally with no network round trip and synced like any new task.

#### Scenario: Double-click a slot
- **WHEN** the user double-clicks Tuesday 14:30 in the Week, types "Call the bank" and presses Enter
- **THEN** a task "Call the bank" due Tuesday at 14:30 appears as a block there at once

#### Scenario: Context menu
- **WHEN** the user right-clicks Wednesday 09:00
- **THEN** a menu opens at the pointer with Add task here…, and choosing it opens the dialog with Wednesday 09:00

#### Scenario: Long press on a phone
- **WHEN** on a touch screen the user long-presses an empty slot of the Day view
- **THEN** the same menu opens as a bottom sheet, while a long press on a task block keeps its existing behaviour

#### Scenario: Keyboard
- **WHEN** a Week is shown with a block on Thursday selected and the user presses `q`
- **THEN** the add dialog opens for Thursday without a time, and a typed "at 4pm" sets 16:00

#### Scenario: Offline
- **WHEN** the device is offline and the user double-clicks a slot and adds a task
- **THEN** the block appears at once and the task is uploaded on the next sync

### Requirement: Colour by
The Calendar's overflow menu SHALL offer Colour by with Project (default), Label and Priority, applying to Day, Week, Month and Plan, stored per device and never synced. With Label, a task SHALL take the hue of the first of its labels, in the user's label order, whose colour is not the default grey, else the neutral hue; with Priority, priorities 1 to 3 SHALL take the priority hues and priority 4 the neutral hue. The fill, edge, contrast, dimming and selection rules of task blocks SHALL apply unchanged to the chosen hue. Event blocks and frame bands SHALL keep their own look. A missing or unknown stored value SHALL read as Project.

#### Scenario: Colour by label
- **WHEN** the user chooses Colour by Label and a task carries "errand" (orange) and "call" (blue), with "call" first in the label order
- **THEN** its block is drawn in the blue hue, and a task without labels in the neutral hue

#### Scenario: Colour by priority
- **WHEN** the user chooses Colour by Priority
- **THEN** priority 1 blocks take the priority-1 hue and priority 4 blocks the neutral hue, each with a 3:1 edge against the grid in light and dark

#### Scenario: Per device
- **WHEN** the laptop colours by label
- **THEN** the phone's calendar still colours by project

### Requirement: Calendar layout of a project
A project's layout switch SHALL offer Calendar after Timeline, showing the Calendar in its last used mode (Day, Week, Month or Plan) narrowed to the project's open tasks and those of its sub-projects, inside the project page, with the planning list opening on the project as its source. The narrowing SHALL combine with an active calendar filter and SHALL not be shown as a chip. `v` SHALL cycle List, Board, Timeline and Calendar. The layout choice SHALL be stored per device like the other layouts, an older device reading it as List. The view SHALL render from local data and work offline.

#### Scenario: A project's week
- **WHEN** the user switches the project "Home" to Calendar while the last Calendar mode was Week
- **THEN** the project page shows this week with only the tasks of "Home" and its sub-projects as blocks, and events of subscribed calendars as usual

#### Scenario: Cycle with v
- **WHEN** a project shows its Timeline and the user presses `v`
- **THEN** the project shows its Calendar, and pressing `v` again shows its List

#### Scenario: Older device
- **WHEN** a device without this change opens a project stored with the Calendar layout
- **THEN** it shows the project's List
