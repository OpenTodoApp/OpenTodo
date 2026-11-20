## Why

Issue #1581. A user in Madrid wants a task at 20:00 in Mexico City. Choosing the zone keeps the wall time, as "Fix a due to any zone" says, but the panel's time field then shows the user's own time (03:00) next to the words "Mexico City", and a time typed there is read in the user's zone: typing 20:00 again stores 13:00 Mexico City. Zone first and time second ends the same way. The field shows one zone's time beside another zone's name.

The owner decided (19 Nov): while a task is fixed to another zone, the time field shows and edits that zone's time, with the user's own time as the hint; the stored value stays as it is.

## What Changes

- **The Do on segment edits in the task's zone.** While a due is fixed to a zone other than the viewer's, the date and time fields of the task panel's Do on segment show the stored wall-clock date and time, and what is typed there means that zone's clock.
- **The viewer's time is the hint.** The time line shows the same moment in the viewer's zone, "03:00 your time", with the date when it falls on another day.
- **Unchanged:** the stored value and its format, sync, lists, headings, sorting and the panel's summary (still the viewer's time with the zone's hint), the zone control and its preview, floating dues and dues fixed to the viewer's own zone.

## Capabilities

### Modified Capabilities

- `task-management`: "Fix a due to any zone" says how the Do on segment reads and edits a due fixed to another zone.

## Impact

`web/src/app/task-detail/WhenControl.tsx` (the Do on segment), its test, one new string in every locale. No new field, route, setting or dependency. First load: no measurable change (the panel's code).
