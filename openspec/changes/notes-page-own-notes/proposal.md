## Why

Issue #1478, from Discord: the Notes page lists every task that has a description. People put small bits of context in descriptions ("the battery is at 37%"), and Home Assistant, the browser extension, email and webhooks write their own. Completed tasks are included. On a real account this buries the notes the user wrote, sometimes hundreds to one. The reporter's expectation, now that notes are first-class: a task's description is the task's details, not a note, and a task links to a note when it needs one.

The search chips are already remembered on the device, so `kind:note` works once typed. But the default is still the cluttered list, and every new device starts there.

## What Changes

- **Notes shows notes.** By default the page lists standalone notes and project notes only. Task descriptions appear when the search field holds the `kind:task` chip, which, like every chip, is remembered on the device. Word searches look among the same notes.
- The count, Pinned and Recent headings, Show more, the Graph and the bulk actions follow the same list, as they follow every chip today.
- Nothing else changes:
  - task descriptions stay where they are;
  - the app's global search still finds tasks by their description;
  - a task's links to notes and Linked references are unchanged.

Out of scope:
- renaming a project's note to "description" (the reporter's other idea);
- treating integration-created tasks separately, which this makes moot;
- any change to the data.

No **BREAKING** change: no op field, no setting, no string.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: "Notes page". The default list leaves task notes out, and `kind:task` brings them in.

## Impact

- `web/src/app/notes/` (the list's source and the count).
- Tests, the Notes guide in `docs/`, and a changelog fragment under Changed.

No server change, no dependency, no bundle change worth measuring.
