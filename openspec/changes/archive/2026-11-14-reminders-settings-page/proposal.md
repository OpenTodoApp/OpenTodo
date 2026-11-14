# Proposal

## Why

Issue #1320. A person with "Tasks with a time" set and "Tasks with no time" left at None opens an undated task's editor, picks a day and then a time, and gets no reminder. The editor writes the date and the time as two changes: the first gives the task a date only, for which there is no default, and the second only switches the kind of due, which never adds a default reminder. The same happens in reverse with only "Tasks with no time" set.

The defaults also sit on the Push notifications page, although a default reminder is an ordinary reminder that every channel delivers (in the app, push, the native shells, delivery channels, calendar alarms). People look for them as a reminder setting, not a push one.

## What Changes

- **The date, then the time.** When a write switches a due between a date only and a date with a time, the person has no default for the old kind and the task has no default reminder, the task counts as getting its due: the default for the new kind is added, with the usual exceptions (completed, deleted, a habit, a live relative reminder, a deleted default reminder). Web and server (`internal/defaultreminder`) share the rule through new vectors.
- **A Reminders page.** Settings → Notifications gets a first page, Reminders, with Default reminders; Push notifications keeps the device's push settings.

Not **BREAKING**: no field, route or op change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`: the default reminder after a kind switch without an old default; where the defaults live.
- `settings-navigation`: the Notifications pages.

## Impact

- Web: `web/src/lib/defaultReminder.ts` and its vectors; `settingsSections.ts`, `settingsPages.tsx`, `settingsIndex.ts`, `screens.ts`; strings in every catalog.
- Server: `internal/defaultreminder` (REST with `default_reminder=true`, the agent write tools).
- Docs: `docs/default-reminders.md`, `docs/settings.md`, `docs/notifications.md`.
- Size: a few bytes in the first load (the page entry); the page is lazy with Settings.
