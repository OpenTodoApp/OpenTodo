## ADDED Requirements

### Requirement: Set today's focus
When write tools are allowed, `tools/list` SHALL add `set_today_focus`, which takes `ids` (zero to three task ids, most important first) and an optional `timezone`, and replaces today's focus with them: it SHALL write `focus_date`, `focus` and, with Bento, `focus_slots` on the user's own review row as operations, by the same rule as the routine step "Set today's focus" (open tasks only; Three tasks keeps them in order, Bento places by estimate and then in the first free slot), and return the ids placed. `[]` SHALL clear today's focus. Today SHALL be the account's logical today (its day start) in `timezone`, the account's time zone by default. Only tasks the user can see SHALL be accepted, a shared task assigned to someone else included, as in the Daily check: an unknown, deleted, foreign or hidden id SHALL be a tool error `not_found`, and more than three distinct ids a JSON-RPC `-32602` error (a repeated id counts once); in each case nothing is written. With Three tasks the tool SHALL leave `focus_slots` as it is. The tool SHALL follow the write gate of every write tool and SHALL answer `token_restricted` to a token limited to workspaces. `today_summary` SHALL return `focus`, the ids of today's focus in the app's order (`[]` when none is set for today), and `focus_date`, the day it is for: the account's logical today in `timezone`, or in the account's time zone when none is given, counted the way `set_today_focus` counts it. Changes are operations: devices that are offline apply them on their next sync, and a focus picked on a device at the same time converges by last-writer-wins per field.

#### Scenario: Set the focus
- **WHEN** an allowed assistant calls `set_today_focus` with the ids of "Taxes" and "Call the plumber"
- **THEN** the Daily check and the Loop home show those two tasks as today's focus on every device after sync, and `today_summary` returns their ids in `focus`

#### Scenario: Replace and clear
- **WHEN** the assistant calls `set_today_focus` with three other ids, then with `[]`
- **THEN** today's focus is first exactly those three tasks, then empty

#### Scenario: Bento
- **WHEN** the user's focus style is Bento and the assistant sets a 15-minute, a 2-hour and an unestimated task
- **THEN** the 2-hour task takes the Large slot, the unestimated one the Medium slot and the 15-minute one the Small slot, as the Daily check places them

#### Scenario: More than three
- **WHEN** the assistant calls `set_today_focus` with four ids
- **THEN** the response is a JSON-RPC `-32602` error naming `ids` and nothing is written

#### Scenario: Someone else's task
- **WHEN** the assistant passes the id of another account's task, or an unknown id
- **THEN** the result is a tool error `not_found` and today's focus is unchanged

#### Scenario: A shared task assigned to someone else
- **WHEN** the assistant sets the focus to a task of a shared project assigned to another member
- **THEN** the task is in today's focus, as when the user picks it in the Daily check

#### Scenario: Day start
- **WHEN** the account's time zone is Europe/Berlin with a 04:00 day start and the assistant sets the focus at 02:30 local time on 13 October
- **THEN** the focus is written for 12 October and `today_summary` returns it with `focus_date: "2026-10-12"` until 04:00

#### Scenario: Token limited to workspaces
- **WHEN** an `agent` token limited to the workspace "Work" calls `set_today_focus`
- **THEN** the result is a tool error `token_restricted` and nothing is written

#### Scenario: Not allowed to write
- **WHEN** a `read` token, or an `agent` token whose user switched writes off, calls `set_today_focus`
- **THEN** it is not listed and the call is refused like any write tool
