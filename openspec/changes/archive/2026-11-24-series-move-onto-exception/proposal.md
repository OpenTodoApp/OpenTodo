# Proposal

## Why

Issue #1971: a weekly Sunday series due 6 December, whose 29 November occurrence is done, was moved back to 29 November with All occurrences selected. The panel showed 29 November and the "Date changed" toast, and a few seconds later the series was back on 6 December with nothing to say why. Each try also moved the start a week later, so start and due drifted apart.

The final date is what "Exceptions come from the records" asks for: a date with a record is an exception of its series, and a device that finds the series due on one moves it, with its start and deadline, to the next free date. That repair runs after the next pull, so the date change was written, confirmed, then undone by the same device. The start drifted because the date change left the start where it was and the repair shifted it forward by the week it moved the due date.

The spec says nothing about a date change that puts the series on its own exception. The simplest honest behaviour is to refuse it on the device, before writing, with the reason.

## What Changes

- Moving a series' due date (the panel's When, a typed date, a drag in Day, Week, Month or Plan, Triage) onto a date that has one of its records writes nothing and says why in a toast instead of "Date changed": "Sun, 29 Nov is already done", "… was skipped" or "… already has its own occurrence". The series, its start and its deadline stay as they were.
- Any other date still moves the series as before, earlier dates included.

## Out of scope

- Resetting a series to an earlier, completed occurrence (reopening or removing the record). The record can still be reopened from Completed.
- Marking taken dates inside the date picker.
- Writes from the API, the CLI or the assistant: the repair still moves such a series on.

No ROADMAP.md item; a bug fix. No new op field, no op log change, no new environment variable.
