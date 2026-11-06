# Proposal

## Why

The rule grammar has `every last weekday` (the last Monday to Friday of the month) but not the first, second, third or fourth. Payments, salary runs and reports often fall on the n-th working day of a month, and the gap is confusing ([#834](https://github.com/OpenTodoApp/OpenTodo/issues/834)).

## What Changes

- The grammar accepts `every first weekday` … `every fourth weekday` (and `1st` … `4th`): the n-th Monday-to-Friday day of each month, counting only Monday to Friday. In March 2026, which starts on a Sunday, `every first weekday` is Monday 2 March and `every 2nd weekday` is Tuesday 3 March. The canonical form is `every 1st weekday` … `every 4th weekday`, like the ordinal weekdays; `every last weekday` is unchanged.
- It is a calendar pattern: `after completion` is refused, `until` and `for N times` work.
- CalDAV reads and writes it as `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=n` (n = 1 to 4, `-1` for the last, as today), and the importers accept that RRULE and Todoist's `every first workday` … `every last workday`.
- Quick add reads the phrase in its six languages with the existing ordinal words and "weekday" words (`jeden ersten Werktag`, `chaque premier jour ouvré`, `ogni primo giorno feriale`, `cada primer día laborable`, `todo primeiro dia útil`).

No new environment variable. A rule is a string field; the op log format is not **BREAKING**. An older client that does not know the new pattern shows the rule but cannot compute it, like any rule newer than the client.

## Capabilities

### New Capabilities

### Modified Capabilities

- `recurring-tasks`: the rule grammar gains the ordinal weekday of the month.
- `natural-language-capture`: recurrence phrases cover it in every language.

## Impact

- `internal/recurrence` and `web/src/lib/recurrence.ts` with the shared vectors, the RRULE mapping, habits' scheduled-day check, quick add on both sides, the importer's spellings, docs.
- No new route, no new dependency, no size impact worth reporting.

Out of scope: a 5th weekday (the ordinals stop at 4th everywhere else), holidays, and ordinals before `weekend`. Advances no open ROADMAP item.
