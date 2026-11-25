# Focus timer as a shortcut back to the session

## Why

GitHub issue #1942: while a Focus session runs, its time entry shows in the sidebar footer (the bar below 768 px) as the running entry pill, so the timer stays in sight after the person leaves the Focus screen. Activating it opens the task panel, or on a phone a sheet with Open and Stop, so there is no direct way back to the session the timer belongs to.

## What Changes

- When the running entry is the work stretch of the person's running Focus session, activating the running entry indicator opens the Focus screen instead of the task: the footer pill's body from 768 px, "Go to Focus" in place of "Open the tracked task" in the icon rail's menu, and the bar's pill below 768 px, which goes straight to Focus instead of opening the sheet (the Focus screen holds Stop and the other controls).
- Its accessible name says where it goes and keeps the visible text ("Go to Focus: 1:05 · Write the report"). The look, the Stop control, the announcements and the ticking are unchanged.
- An entry started outside Focus behaves as before.

No new mandatory environment variable, no new op field, no new route: the indicator reads the device's Focus state and writes nothing.

## Out of scope

- Showing the indicator while a Focus session is paused or on a break (no entry runs then).
- The end-of-session sound and notification (#1762).

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### Modified Capabilities

- `time-tracking`: the running indicator opens the Focus screen when its entry belongs to the running Focus session.
- `app-shell`: the footer pill's activation follows the same rule.
