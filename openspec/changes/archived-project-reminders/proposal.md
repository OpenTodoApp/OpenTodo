# Proposal

## Why

Archiving a project takes it and its tasks out of the open lists: it is how a person says the work is finished or on hold. Its unfinished tasks' reminders still fired, in the app, by push, through notification channels and as notifications the mobile app scheduled (issue #1234), because the rule that holds reminders back looked only at the Trash.

## What Changes

- **Archived projects hold reminders back like the Trash:** a reminder does not fire while its task's project, or any project above it, is archived. Nothing is recorded, so unarchiving brings it back: a reminder whose time is still ahead fires on time, and one whose time passed while the project was archived is delivered once on the next check, as after a restore from the Trash.
- **Every delivery path follows one rule:** the in-app watcher, the server's push scheduler (and with it the notification channels' reminder hook) and the reminders handed to a native shell. The web app and the server share the rule through one vectors file.
- **Unchanged:** calendar clients already get no alarms for archived projects, because CalDAV and calendar sync leave archived projects out.

## Capabilities

### Modified Capabilities

- `reminders`: "Reminders in the Trash" becomes "Reminders in the Trash and archived projects" and names every delivery path.

## Out of scope

Completing or dismissing the reminders of an archived project's tasks; archiving itself.

## Roadmap

A fix outside the roadmap's milestones (issue #1234).
