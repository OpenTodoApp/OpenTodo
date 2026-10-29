## Purpose
Lets a task occupy several days: a span from its start date to its do-on date, drawn as a bar across those days in the calendar and moved or resized by pointer and keyboard, without changing what a start date means for other tasks.

## ADDED Requirements

### Requirement: Span field
A task SHALL have an additive boolean `span`, default false. It SHALL be validated like other fields, settable offline, synced as a field operation, converging by per-field last-writer-wins, included in the export and the REST representation, and stored and forwarded untouched by a client without it. It is not a content field and SHALL stay plaintext on encrypted accounts. A task SHALL be drawn as a span only when `span` is true, its start is a date and its do-on date is a later date; otherwise it SHALL be drawn as a task without the flag, and the flag SHALL be kept. No write SHALL be refused because of the combination.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** its span is false and no operation is written for it

#### Scenario: Invalid value rejected
- **WHEN** a client submits `"span": "yes"` through the API or the sync endpoint
- **THEN** the write is rejected as invalid and the task is unchanged

#### Scenario: Flag without a valid range
- **WHEN** a task has `span` true, the start `2026-11-05` and the do-on date `2026-11-05`
- **THEN** it is drawn on 5 November only, as a task without the flag, and still carries `span` true

#### Scenario: Concurrent flag and move
- **WHEN** device A turns a task into a span from 3 to 5 November while device B, offline, moves its do-on date to 2 November, and both sync
- **THEN** every device holds A's start and flag and B's do-on date, and draws the task on 2 November only until the range is valid again

#### Scenario: Older client passes it through
- **WHEN** a device running a client that predates the field edits the title of a span task
- **THEN** after sync the task is still a span with the new title on every device

### Requirement: Making a task multi-day
The When popover's Start segment SHALL offer a **Multi-day** switch when the task has a do-on date. Turning it on SHALL write `span` true and, unless the start is a date before the do-on date, the start equal to the day before the do-on date, in one batch, and SHALL focus the start date field. Turning it off SHALL write only `span` false. The When line of a span SHALL read its range ("3–5 Nov"). Viewers SHALL see the range as text. The switch SHALL be reachable with the keyboard and work offline.

#### Scenario: Turn on without a start
- **WHEN** a task is due 2026-11-05 without a start and the user turns on Multi-day
- **THEN** in one batch its start becomes `2026-11-04` and span true, the When line reads "4–5 Nov", and the start date field has focus

#### Scenario: Turn on with an earlier start
- **WHEN** a task is due 2026-11-05 with the start `2026-11-03` and the user turns on Multi-day
- **THEN** only span is written, and the When line reads "3–5 Nov"

#### Scenario: Turn off
- **WHEN** the user turns off Multi-day on a span from 3 to 5 November
- **THEN** span becomes false, the start stays `2026-11-03`, and the task is deferred until the 3rd as any task with that start

#### Scenario: Offline
- **WHEN** the device is offline and the user turns on Multi-day
- **THEN** the bar appears in the calendar at once and the batch uploads on the next sync

### Requirement: Spans in the calendar
Week SHALL draw a span as one bar across the days it covers in the all-day strip, above multi-day event chips, in the task style (soft fill of the project hue, solid edge on its leading side, strong text tone), told apart from event chips by shape and texture, with a squared-off end and a chevron where it continues beyond the shown week. Day SHALL draw the span's piece for that day in the all-day strip labelled with its position ("Day 2 of 3") and, on the last day, its due time when it has one. Month SHALL draw a span as a bar across the cells of each week row it covers, above the cells' other rows, continuing on the next row. Plan SHALL list a span in the column of each day it covers with its position. A span SHALL never be drawn as a timed block on the grid. Parts of a bar on days before today SHALL be dimmed like past blocks. Spans SHALL count toward the strip's and the cell's visible rows and their "+N" controls. A span's estimate SHALL count toward the capacity of its due day only.

#### Scenario: Three-day trip in the week
- **WHEN** a task "Lisbon trip" of the blue project "Travel" is a span from Tuesday to Thursday and the user opens that week
- **THEN** one blue bar spans Tuesday to Thursday in the all-day strip, drawn with a solid edge, and an all-day event on Wednesday is drawn as a hatched chip below it

#### Scenario: Span across two weeks in the month
- **WHEN** a span runs from Saturday 7 to Tuesday 10 November and the weeks start on Monday
- **THEN** the Month draws a bar on the 7th and 8th in one row, ending squared off, and a bar from the 9th to the 10th in the next row, starting squared off

#### Scenario: Day view with a due time
- **WHEN** a span from 3 to 5 November is due 5 November at 17:00 and the user opens the Day of the 5th
- **THEN** the all-day strip shows the task as "Day 3 of 3" with "until 17:00", and no block is drawn on the grid

#### Scenario: Capacity on the due day
- **WHEN** a span from 3 to 5 November has an 8-hour estimate
- **THEN** the 5th counts 8 hours and the 3rd and 4th count nothing for it

#### Scenario: Not a span without the flag
- **WHEN** a task has the start `2026-11-02` and is due `2026-11-06` and span is false
- **THEN** the calendar draws it on the 6th only, as before

### Requirement: Moving and resizing a span
In Week and Month, dragging a span's middle SHALL move its start and do-on date by the same number of days in one batch; dragging its leading end SHALL change the start and its trailing end the do-on date (time and zone kept), never past the other end. Dragging the trailing end of a date-only task that is not a span to a later day SHALL make it a span from its current do-on date to that day in one batch (start, do-on date and span). With a span selected, `Left` and `Right` SHALL move it by one day, `Shift+Left` and `Shift+Right` SHALL move its last day, and `Alt+Shift+Left` and `Alt+Shift+Right` SHALL move its first day; on a selected date-only task that is not a span, `Shift+Right` SHALL make it a two-day span. Each action SHALL be one undoable change, applied locally first, queued offline and converging by last-writer-wins. The shortcuts SHALL be registered in the shortcut registry for the calendar views without conflict. Tasks the user may not edit SHALL show no drag ends and SHALL not move.

#### Scenario: Move the whole span
- **WHEN** the user drags the middle of a span from 3 to 5 November one day to the right
- **THEN** in one batch its start becomes the 4th and its do-on date the 6th, and one Undo puts back both

#### Scenario: Lengthen with the keyboard
- **WHEN** a span from 3 to 5 November is selected in the Week and the user presses `Shift+Right`
- **THEN** its do-on date becomes the 6th and its start stays the 3rd

#### Scenario: Shrink to one day
- **WHEN** the user drags the leading end of a span from 3 to 5 November onto the 5th
- **THEN** its start becomes the 5th, it is drawn on the 5th only, and it keeps span true

#### Scenario: Extend a single-day task
- **WHEN** a task due 3 November without a time is selected in the Month and the user presses `Shift+Right`
- **THEN** in one batch its start becomes the 3rd, its do-on date the 4th and span true, and a bar covers the 3rd and 4th

#### Scenario: Two devices move the same span offline
- **WHEN** device A moves a span to start on the 10th and device B to start on the 12th, both offline, and both sync
- **THEN** every device shows the start and do-on date of the later move, never one from each

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer of the shared project a span belongs to
- **THEN** the bar is shown without drag ends and the arrow keys do not move it

### Requirement: Recurring spans
A recurring span SHALL keep its length on every occurrence, because its start moves with the series. The completed occurrence record, a materialised occurrence and a detached copy SHALL carry the span flag and the start and do-on date of their occurrence. Projected occurrences of a span series (OpenSpec `recurring-tasks`, "Projected occurrences in the calendar") SHALL be drawn as spans of the series' current length ending on the projected date, dimmed like other projections; overlapping projected spans SHALL be stacked, never merged.

#### Scenario: Weekly two-day span
- **WHEN** a task with `every monday` is a span from Sunday 8 to Monday 9 November and the user opens the Month
- **THEN** the Month draws the 8th–9th as a bar and the 15th–16th, 22nd–23rd and later as dimmed projected bars

#### Scenario: Completed occurrence keeps its span
- **WHEN** that series is completed on the 9th
- **THEN** the completed record carries span true with the start the 8th and the do-on date the 9th, and the series is a span from the 15th to the 16th

### Requirement: Spans in Today, Upcoming and lists
A span before its first day SHALL be deferred as `start-dates` says, and Upcoming SHALL list it once under its first day with a range chip ("3–5 Nov"). From its first day to its do-on date Today SHALL list it with the chip "until <date>" in place of the "Started" chip. In every list the range chip SHALL replace the date chip, so the number of visible properties is unchanged. Membership SHALL be computed on the device and change with the day without a write.

#### Scenario: Upcoming before the trip
- **WHEN** today is 1 November and a span runs from 3 to 5 November
- **THEN** Upcoming lists it under 3 November with "3–5 Nov" and not under 5 November, and Today does not list it

#### Scenario: During the trip
- **WHEN** today is 4 November
- **THEN** Today lists it with "until 5 Nov" and the Today count includes it

### Requirement: Spans on narrow screens
Below 640 px the Week agenda SHALL list a span under each day it covers with its position, and the Month SHALL count it on each covered day and list it with its range chip under the grid for a focused covered day. Drag ends SHALL not be offered below 640 px; the When sheet SHALL change the range.

#### Scenario: Week agenda on a phone
- **WHEN** the user opens the Week on a 390 px screen with a span from Tuesday to Thursday
- **THEN** Tuesday, Wednesday and Thursday each list it with "Day 1 of 3", "Day 2 of 3" and "Day 3 of 3", and nothing overflows horizontally

### Requirement: Spans through the API, CLI and agents
The REST API SHALL accept and return `span` as a boolean task field, refusing anything else with `400 invalid_input`. The CLI SHALL accept `--span` and `--no-span` on `ot add` and `ot edit` and SHALL print a span's range in `ot show`. Assistant and MCP task results SHALL carry `span: true` for a span, and the create and update tools SHALL accept `span`. No new route SHALL be added.

#### Scenario: Create a span through the API
- **WHEN** a script POSTs a task with `"start": "2026-11-03"`, `"due": {"date": "2026-11-05"}` and `"span": true` with a full token
- **THEN** the task is created and every device draws it from the 3rd to the 5th after sync

#### Scenario: Unauthenticated write refused
- **WHEN** a request without a session or token PATCHes `span` on a task
- **THEN** the response is 401 and the task is unchanged

#### Scenario: CLI
- **WHEN** the user runs `ot edit <id> --start 2026-11-03 --due 2026-11-05 --span`
- **THEN** the task is a span from 3 to 5 November and `ot show <id>` prints "3–5 Nov"
