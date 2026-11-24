# Proposal

## Why

Microsoft retires the Microsoft To Do apps on 30 June 2027 and gives personal accounts no replacement, so many people will move their lists through the `microsoft-todo-json` import. An audit of the profile against the Microsoft Graph v1.0 schema (`todoTaskList`, `todoTask`, `checklistItem`, `linkedResource`, `patternedRecurrence`, `dateTimeTimeZone`, `itemBody`) found repeats and notes that real To Do data uses but the import loses or garbles:

- Repeats every N weeks on given days, every N months, on the nth weekday of the month ("second Thursday", "last weekday"), on the nth weekday of a month each year, and with an end date or a number of times were dropped, although the rule grammar says each of them.
- An Outlook HTML body is a whole document with a `<head>` and a `<style>` block: its CSS could end up in the description.
- Outlook task statuses (`inProgress`, `waitingOnOthers`, `deferred`) were accepted silently and an unknown status was not reported.
- A completed repeating task kept its rule, beside the open task To Do created for the next occurrence.
- Shared lists became projects without a word in the preview.
- Due and start dates took the date part of the value Graph returns, which Graph usually converts to UTC: a task due 15 April at UTC+2 comes back as `2023-04-14T22:00` UTC and was imported a day early.
- A linked resource without a `webUrl` (it is optional) was dropped silently.

## What Changes

- `recurrence` becomes the iCalendar rule its pattern and range stand for and is read by the grammar's RRULE reader, so every pattern the grammar says is kept exactly, with its interval and its end (`until` / `for N times`); anything else, such as two weekdays of the month, warns as before. A range end the rule cannot carry drops with a warning, keeping the rule.
- HTML bodies lose comments and their head, style, script and template elements with their content; list items become `- ` lines. The result is text.
- `notStarted`, `inProgress`, `waitingOnOthers` and `deferred` are open tasks; any other status is an open task with a warning.
- A completed task carries no rule.
- Each shared list adds a preview note.
- Checklist items keep their `createdDateTime`.
- Due and start dates: a midnight in a named zone other than UTC is that day; any other value is converted into the import's time zone and rounded to the nearest midnight.
- A linked resource without a `webUrl` warns.

Out of scope: file attachments (Graph needs one request per task, the guide's script does not make it), the PowerShell script and the guide's prose. No new field, op, route, dependency or environment variable. Advances the importers line of `ROADMAP.md`.

## Capabilities

### Modified Capabilities

- `data-import`: Microsoft To Do structure (shared-list note) and attributes (recurrence patterns and ends, HTML bodies, statuses, completed repeats).

## Impact

`internal/importer/profile_mstodo.go`, its tests and fixtures, `docs/import.md` and the facts of `docs/switch/microsoft-todo.md` that change. The golden preview of the script-written fixture changes only in the steps' creation time.
