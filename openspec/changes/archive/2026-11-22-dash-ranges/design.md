# Design

## D1: Month first, a dash without a year is a range

`numericDateAt` (both parsers) returns no date for `d-d` without a year unless the order is day-month. The order already comes from the synced date format (or the language), so every device and the server read a line the same way, offline too. A year makes the intent clear (`3-4-2027`), so it still parses; the slash form is the month-first habit and is unchanged. The month-first swap for an impossible reading (`25/12`) still applies to slashes; `25-12` month first is now text.

## Data model

None.

## Interface budget

None: parsing only.
