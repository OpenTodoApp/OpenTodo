---
title: Habits from elsewhere
summary: Habit numbers on the server, the assistant's habit skills, logging a day from a phone shortcut, the terminal, Home Assistant or a routine.
audience: user
section: Integrations
specs: [habits, assistant-skills, routines]
screens: []
order: 53
---
# Habits from elsewhere

The server works out a [habit's](habits.md) kept, strength and streaks exactly as your devices do, from what has synced: a day checked in offline counts once that device syncs. It needs no text, so it works on encrypted accounts too.

## The assistant

While Habits is on, the [assistant](assistant-skills.md) has two habit skills:

- **Start a habit** turns "I want to read more in the evening" into one habit to review: a name, how often, a tiny version, the moment it follows and a part of the day. Applying it turns Habits on.
- **How are my habits?** gives kept, strength and streaks exactly as the app shows them, the days you usually miss and your check-in notes. It never makes up a number and changes nothing.

**Turn this into tasks** also reads check-ins: "ran 5k, knee sore, skipped stretching" becomes Run done today with the note "5k, knee sore" and Stretch skipped, next to any tasks, all reviewed with one Undo.

While Habits is off, none of this is offered. Outside assistants use the [MCP](mcp.md) tools `list_habits`, `get_habit` and `log_habit`.

## A shortcut, a script or the terminal

- **A phone shortcut or a script**: `POST /api/v1/habits/{id}/log` with `{"state": "done"}` and a token ([API](api.md#habits)).
- **The terminal**: `ot habits`, `ot habits show Run`, `ot habits log Run --note "5k"` ([CLI](cli.md#habits)).
- **Home Assistant**: a `rest_command` to the same address ([example](home-assistant.md#automation-examples)).

## Routines

**Find habits** lists your open habits, or only those at risk or back on track; **Log a habit** logs one as done, the tiny version or skipped. An evening routine can nudge you about a habit missed twice, and a webhook can log a walk ([routines](routines.md)).
