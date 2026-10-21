# Spec Delta

## MODIFIED Requirements

### Requirement: Events drawn in Day and Week
The Day and Week views SHALL draw each timed occurrence as a block between its start and end in the viewer's zone, and each all-day or multi-day occurrence as a chip in an all-day strip above the day's unscheduled lane, on each day it covers. An event block SHALL be told apart from a task block by its shape and texture, never by colour alone: it SHALL use the sunken surface as its fill, a hatched 3 px edge on its leading side, the muted text tone for its summary, and its calendar's colour only as a small dot before the summary, while task blocks use a solid edge and a hue fill. A block SHALL show the summary and, on hover or focus, the time, location and calendar name. A free (transparent) occurrence SHALL be drawn as a dashed outline only. The all-day strip SHALL show at most three chips per day; a day with more SHALL show the first three and a "+N" control that expands that day's strip on this device, remembered per device and never synced.

#### Scenario: Meeting next to a task
- **WHEN** a "Team sync" event runs 10:00 to 11:00 and a task block sits at 10:30
- **THEN** both are drawn side by side with the overlap marker, the event on the sunken fill with a hatched edge and its calendar's dot, the task with its project's hue fill and solid edge

#### Scenario: Told apart without colour
- **WHEN** a task of a green project and an event of a green calendar sit side by side
- **THEN** a viewer who cannot see the colour still tells them apart by the hatched edge and the dot of the event against the solid edge and fill of the task

#### Scenario: All-day event
- **WHEN** a subscription holds a two-day all-day "Offsite" event
- **THEN** an "Offsite" chip appears in the all-day strip of both days and nothing is added to the grid or the planned total

#### Scenario: Crowded all-day strip
- **WHEN** a day holds five all-day events
- **THEN** its strip shows three chips and "+2", activating it shows all five on this device until collapsed, and the other days' strips are unchanged

#### Scenario: Free events
- **WHEN** an occurrence is marked transparent (free) in its source
- **THEN** its block is drawn as a dashed outline only, so a free slot still reads as free

#### Scenario: Event across midnight
- **WHEN** an event runs from 22:00 to 02:00 the next day
- **THEN** it is drawn from 22:00 to the end of the first day and from 00:00 to 02:00 on the next
