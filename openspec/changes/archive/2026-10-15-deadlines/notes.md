# Implementation notes

## Smoke test (task 10.1), 2026-10-15

Built binary on port 18080 with a throwaway data directory, driven by Playwright (Chromium, 1280×800):

- Quick add `Send report deadline friday` showed a deadline chip ("Deadline Tomorrow · Fri, Oct 16"); the saved row showed the hourglass countdown `1d` with the full date as its title.
- `j`, `j`, `d` on a second task opened the panel's Deadline field focused; typing today's date and Enter set it.
- Today listed the task with today's deadline; the sidebar Today count was 1 (the same predicate).
- Upcoming listed the deadline-only task under Tomorrow with the amber `1d` countdown.
- The Filter view with `deadline <= 7 days` listed both tasks.
- No console or page errors.

Crossing midnight, the CalDAV client round trip and the CSV import are covered by automated tests instead of by hand: the countdown is a pure function of `todayISO()` (dates/views tests), `TestCaldavDeadlineRoundTrip` exercises PUT and GET, and `TestDeadlineImportAndOwnRoundTrip` imports a CSV with a `deadline` column.

## Decisions taken while implementing

- CalDAV: a `DUE` without `DTSTART` on a task that has a deadline rewrites the deadline (design D6, "Risk accepted"), so a deadline-only task survives a client edit. A `DTSTART` equal to `DUE` stays client data when the rule is not expressible, as before.
- Server writes (REST, CalDAV, assistant) recompute deadline reminders like the web client (`reminderOpsForTask`), per the reminders requirement.
- A time right after a quick-add deadline phrase stays in the title.
- named-importers already shipped its Todoist and Things profiles, so its spec delta and design were updated here (task 9.2): both map to the deadline field.
