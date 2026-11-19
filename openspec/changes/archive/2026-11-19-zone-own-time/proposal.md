# Proposal

## Why

Fixing a task to another time zone looks as if it changes the time (GitHub issue [#1581](https://github.com/OpenTodoApp/OpenTodo/issues/1581)). A Berlin user sets 20:00 and picks Mexico City: the due is stored as `20:00 America/Mexico_City`, as intended. But the time field beside the words "Mexico City" then shows 03:00, the same instant in Berlin, and a time typed there is read in Berlin's zone. So typing 20:00 again stores 13:00 Mexico City. The field shows the viewer's time next to another zone's name. The owner decided on 19 Nov that the field shows the task's own zone.

## What Changes

- **The Do on editor shows and edits a zoned due in its own zone.** While a due is fixed to a zone other than the viewer's, its date and time fields read the wall-clock date and time in that zone, and a time or date typed there keeps the zone.
- **The viewer's time is a hint under the fields:** "20:00 in Mexico City = 03:00 (3 Nov) your time (Berlin)". This is the zone panel's existing preview sentence, already translated in every shipped language.
- Unchanged: lists, headings, calendars, sorting and grouping still show the viewer's time with the "09:00 Berlin" hint. Floating dues and dues in the viewer's own zone look as before.

Out of scope: the two-buttons idea in the issue, and the quick-add parser.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-management`: "Display in the viewer's zone" names the editor as its exception; "Fix a due to any zone" says how the editor reads and writes a zoned due.

## Impact

- `web/src/app/task-detail/WhenControl.tsx` (the zone the Do on fields use, the hint line), `ZoneControl.tsx` (the preview sentence as `zonePreview`, shared).
- No new string, no data change, no server change; a few bytes of bundle.
