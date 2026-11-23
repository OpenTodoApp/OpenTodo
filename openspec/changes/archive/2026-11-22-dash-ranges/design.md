# Design

## D1: Month first, a dash without a year is a range

`numericDateAt` (both parsers) returns no date for `d-d` without a year in a quick-add line unless the order is day-month or a word that introduces a date ends right before it (`dateWordBefore`: the vocabulary's `before`, `byWords` and `untilWords` phrases, so `on 3-4`, `by 4-15`, `until 12-31` and `bis zum 3-4` stay dates). The date context's `dashRanges` flag marks a quick-add line: the TypeScript line parser and Go's `Parse` set it; the when-picker's typed field, the repeat-phrase field and `ParseReminder` leave it off, since a field that only takes a date has no range to protect. The order already comes from the synced date format (or the language), so every device and the server read a line the same way, offline too. A year makes the intent clear (`3-4-2027`), so it still parses; the slash form is the month-first habit and is unchanged. The month-first swap for an impossible reading (`25/12`) still applies to slashes; `25-12` month first is now text.

## Data model

None.

## Interface budget

None: parsing only.
