# Proposal

## Why

Today lists every open task due today or earlier, including tasks in a shared project that are assigned to someone else. There is no way to leave those out: Assigned to me omits unassigned tasks, and the filter language has no assignee term, so a saved view cannot say "today, and mine or unassigned" ([#827](https://github.com/OpenTodoApp/OpenTodo/issues/827)).

## What Changes

- The filter language gains assignee terms: `assigned`, `unassigned` (and `!assigned`), `assigned: me`, and `assigned: name`. The condition builder offers Assignee. Both the device and the server's saved-view parser accept them.
- Today's menu gains **Hide tasks assigned to others**, off until turned on. On, Today drops tasks in a shared project assigned to someone else and keeps yours and the unassigned ones. The choice is a synced account preference, so it follows every device and works offline.
- Assumed, because it decides what existing shared accounts see: the option defaults to off. A Today that already shows someone else's task keeps showing it until the person turns the option on.

No new environment variable. The new preference is an additive field; the op log format is not **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities

- `filter-queries`: assignee terms in the published grammar, evaluated on the device and accepted by the server.
- `task-assignment`: Today can hide tasks assigned to other members, off by default.
- `web-app`: "Standard views" keeps Today's date rule and names the exception when that option is on.

## Impact

- Filter parsers and evaluators on both sides (`web/src/lib/filter`, `internal/filter`), the condition builder, `docs/filters.md`.
- Today list, its sidebar count, the icon badge and the day-page briefing, plus one additive `user_prefs` field.
- No new route, no new dependency.

Out of scope: Upcoming, project lists, and Assigned to me keep their current membership. The option does not become the default. A separate phone order is not part of this. Advances no open ROADMAP item.
