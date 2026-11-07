## Context

A rule is a short English phrase in `task.recurrence`. `every 2 weeks` is an interval anchored on the due date, so "every other Saturday" was stored as `every 2 weeks` with the due date on a Saturday. A line with its own date ("today and every other Saturday") moved the anchor to that date and lost the weekday. Quick add knew only the words of the rule itself, so connectors and "starting …" stayed in the title.

## Decisions

### D1. `every N weeks on <weekdays>` in the grammar

The weekday list may follow `N weeks` after `on`: `every 2 weeks on saturday`, `every 3 weeks on monday, friday`, with `until` or `for N times` after it. It is a calendar pattern (no `after completion`). With N = 1 it is the weekday rule and is stored as such (`every week on tue` is `every tuesday`), so each meaning has one stored form. Quick add produces it for `every other <weekday>` (every bundled form) and for `every N weeks on <weekday>`, the "on" word being per language (`on`, `am`, `le`, `el`/`los`, `il`/`di`, `na`/`no`/`às`/`aos`).

Alternative rejected: keeping `every 2 weeks` and moving the due date to the weekday. It would drop the date the user typed ("today") and leave the rule unable to hold its weekday when the task is moved.

### D2. The week phase comes from the due date

The next occurrence is the first rule weekday strictly after the due date in a week (Monday to Sunday) that is a multiple of N weeks from the due date's week; catching up after an overdue occurrence keeps that phase. It is an RRULE `FREQ=WEEKLY;INTERVAL=N;BYDAY=…` with WKST=MO and the due date as DTSTART, so CalDAV clients compute the same dates, and the rule maps to and from that RRULE exactly. A due date on another weekday is an occurrence of its own and the next ones follow the rule: due Wednesday 4 November with `every 2 weeks on saturday`, the next is Saturday 7 November, then 21 November. The first occurrence for an undated task (`First`) is the nearest rule weekday on or after the date, which then sets the phase. Habits count the same dates (`scheduled`).

The week phase does not follow the user's week-start preference: the rule's dates must not change with a display setting, and every device and the server must agree.

### D3. Start phrases

A start word followed by a date phrase, right before or after a rule (or after its `until`/`for` tail), belongs to the recurrence phrase: the task is due on the rule's first date on or after that date (`every other saturday starting today`, today a Wednesday, is due on Saturday). A date phrase of its own stays the first occurrence even off the rule's weekday (D2), so the two can be told apart: "today and every other Saturday" is due today, "every other Saturday starting today" this Saturday. A start word with no rule next to it stays in the title ("Work from home", "Call mom starting tomorrow").

### D4. Connectors

A connector directly before a recurrence phrase or its start phrase (`and repeat`, `repeating`, `repeat`, `and then`, `then`, `and`, and per language `und dann`, `wiederholen`, `et répéter`, `puis`, `y repetir`, `luego`, `e poi`, `ripeti`, `e repetir`, `depois`…) is part of the phrase and leaves the title with it; dismissing the recurrence chip keeps them all. A connector without a rule after it is never read.

## Data model impact

None: `recurrence` stays a string checked by the grammar; no op, field or migration. A device on an older version cannot parse the new form, and treats it like any rule it does not know (no next occurrence computed there) until it updates. Offline, every device computes the same dates from the rule and the due date; edits converge by the field's last-writer-wins as before.

## Interface budget

No screen changes: the recurrence chip shows the new rule text. Bundle: a few hundred bytes in the quick-add and recurrence chunks.

## Risks

- Bare `and` before a rule: "Bread and every Monday" loses its "and" from the title, which is what such a line means.
- `from` next to a rule: "Leave from Monday every week" is read as starting Monday; without a rule the line reads as before.
