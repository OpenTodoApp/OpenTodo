# Spec Delta

## ADDED Requirements

### Requirement: Imported start dates, Someday and evening
An imported Someday state SHALL become `start` `someday`, a start date SHALL become the `start` date, and an evening mark SHALL set `evening`, each written as an operation like every imported field: the Things to-do `start` value 2 (Someday) and `startBucket` value 1 (This Evening), and the CSV columns `start` (`YYYY-MM-DD` or `someday`) and `evening` (`true`/`false`). A row that is both parked and dated SHALL keep the date and drop Someday with a warning. The own export SHALL round-trip both fields.

#### Scenario: Things Someday to-do
- **WHEN** a Things to-do has `start` 2 and no start date
- **THEN** the task is imported parked, with no due date and no warning about Someday

#### Scenario: Things evening to-do
- **WHEN** a Things to-do has `startBucket` 1 and a start date of 2026-10-21
- **THEN** the task is due 2026-10-21 with the evening flag set and no warning about This Evening

#### Scenario: CSV columns
- **WHEN** a CSV row has `start` `someday` and another has `start` `2026-11-03` with `evening` `true`
- **THEN** the first task is parked, the second has the start `2026-11-03` and the evening flag, and both columns are listed as recognised

#### Scenario: Parked and dated row
- **WHEN** a CSV row has `start` `someday` and `due_date` `2026-11-03`
- **THEN** the task is imported due 2026-11-03 and not parked, with a warning that Someday was dropped

#### Scenario: Own export round trip
- **WHEN** an export holding parked, deferred and evening tasks is imported into an empty account while a device of that account is offline
- **THEN** a fresh export lists the same `start` and `evening` values, and the device receives them as ordinary operations on its next sync
