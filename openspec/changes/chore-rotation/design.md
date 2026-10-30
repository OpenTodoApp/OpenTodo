# Design

## Context

- A recurring task is its own series. Completing it writes a completed occurrence record (id derived from series id and occurrence date) and moves the series' `due` to the next occurrence. Both values are functions of shared inputs, so concurrent completions converge (`recurring-tasks` "Convergent completion across devices").
- The client plans this in `web/src/lib/recurring.ts` `planCompletion`. The server does the same in `internal/sync/recurring.go` for REST, CalDAV, MCP and rules.
- `assignee_id` is checked against the scope's membership at receipt. Departures unassign through server-authored ops.
- Groups exist in created workspaces and grant roles on projects.

## Decisions

**D1. One additive field `task.rotation`, a whole-list register.**

- **Kind:** id list (as `blocked_by`), default `[]`, at most 20 distinct account ids, in turn order.
- **Validity (REST):** it is set only on a top-level task with a `recurrence` in a project whose scope has at least two members. Otherwise the REST API answers 400 `invalid_rotation`.
- **Sync path:**
  - `Apply` refuses an op naming a non-member with reason `not_a_member`, like `assignee_id`.
  - It accepts a rotation on a task that is not (or no longer) recurring. That rotation is inert: no completion rotates it, and clients hide it.
  - So a series whose rule is removed, then added back, keeps its rotation.
- **Not content:** account ids are plaintext like `assignee_id` and `note_mentions`.
- **Alternative:** store a group id and follow the group's membership live (the research's `rotate_group_id`). Rejected for three reasons:
  - Group membership reaches devices as cached directory data, not ops. Two offline devices with different caches would compute different next assignees and diverge.
  - Group order isn't user-defined, and households want "Alice, then Bob".
  - Most households in a personal workspace have no groups at all.
  
  The picker's "Add everyone in <group>" covers the convenience.
- **Alternative:** a separate rotation entity. Rejected: there's nothing to share between tasks, and a field converges by itself.

**D2. The next assignee is a pure function, in Go and TypeScript.**

```
nextAssignee(rotation, current, isMember):
  live = [id for id in rotation if isMember(id)]   // keep order
  if live is empty: return current                  // nothing to rotate to
  i = index of current in live
  if i < 0: return live[0]
  return live[(i + 1) mod len(live)]
```

- `isMember` is the device's view of the task scope's current membership (the owner included).
- **Files:** `web/src/lib/rotation.ts` and Go in `internal/sync/rotation.go`, with vectors in `web/src/lib/rotation.vectors.json`. The vectors cover wrap-around, a current assignee outside the list, an empty assignee, a departed member in the middle, all departed, a single live member and duplicates refused.
- The completing device puts `assignee_id: next` in the same batch as the occurrence record and the series due (`planCompletion` and the server twin). The record keeps the assignee who held the occurrence, so Completed shows who did it.
- Only a series that is completed and continues rotates. When the end condition ends the series, the assignee stays.
- **Convergence:**
  - Devices completing the same occurrence offline read the same `current` (the occurrence's assignee) and the same rotation, so they write the same `next`, and LWW is moot.
  - A completion-relative rule completed on different days: the due date comes from the later stamp, and the assignee is identical either way.
  - A device whose membership cache is stale may name a departed member. `Apply` refuses that one op (`not_a_member`). The record and due are accepted, and the assignee stays whatever the departure repair (D4) chose. The result converges to the server's state on every device.
- **Alternative:** rotate after whoever completed it (`completed_by`). Rejected: two devices completing offline can have different `completed_by`, so the next assignee would diverge.

**D3. What does and doesn't rotate.**

| Action | Rotates |
|---|---|
| Completing the current occurrence (app, REST, CalDAV, MCP, rules) | yes |
| Skip, skip of a habit | no |
| "This occurrence only" (detach) | no; the copy keeps the assignee, the series keeps it too |
| Reopening an occurrence record | no; the series is not rewound |
| Manual reassignment | no; it moves the turn, and the next completion continues after the new assignee |
| Moving the task to a personal project | the rotation becomes inert (a single member) |

**D4. Membership changes.**

The existing server-authored departure batch ("Unassign on departure") changes for tasks in the project whose `rotation` contains the departing account:
- It writes `rotation` without that account.
- When the departing account is the assignee of a recurring task with a rotation, it writes `assignee_id = nextAssignee(oldRotation, departed, isMemberAfterDeparture)` instead of `null`. An empty result means `null`.

Notes:
- Groups removed from a project, deleted groups and deleted accounts go through the same path, because they end memberships the same way.
- A member who joins is never added to a rotation automatically.

**D5. Client presentation, progressive disclosure, interface budget.**

- **Where:** the Assignee menu in the task panel gains "Take turns…", visible only for a recurring task in a project with two or more members, to editors and above. It opens a sheet with:
  - the ordered list, with drag handles and keyboard `Alt+↑/↓`;
  - a member Combobox ("Add person");
  - one "Add everyone in <group>" item per group on the project;
  - Remove;
  - Stop taking turns, which writes `[]`.
- **Panel:** under the Assignee property, one line: "Takes turns: Alice → **Bob** → Carol", where bold marks the current assignee. It is part of the Assignee property, not a new property.
- **Row:** the assignee avatar gains a 10 px rotate glyph from the icon catalogue, with the accessible name "Bob, takes turns". There's no new row property, so at most 7 properties show by default.
- **Simple-list users and personal projects:** nothing appears.
- **Viewers:** the line is read-only.
- **Budget:** no chrome rows, sidebar destinations, scroll regions or shortcuts are added.
- **Phone layout:** the sheet is the standard bottom sheet, and the reorder works with handles as well as long-press drag.
- **Notification:** the existing assignment notification, with the text "It's your turn: Take out the bins" when the change came from a rotation. That is known from the batch: the series completed in the same batch. The kind stays `assigned`, so delivery channels need no change.

**D6. API, CLI, MCP.**

- **REST:** `rotation` is listed in task reads and accepted in `PATCH /api/v1/tasks/{id}` with the validation of D1:
  - 400 `invalid_rotation`;
  - 409 `not_a_member`;
  - 403 `forbidden` for a viewer;
  - 401 without credentials.
  
  Completing through `PATCH /api/v1/tasks/{id}` with `completed_at` (and every other server completion path) rotates.
- **CLI:** `ot task edit --rotate <names or emails, comma-separated>` resolves people with the existing member lookup. `--no-rotate` clears the rotation. `ot task show` prints "Takes turns".
- **MCP:** the task view shows `rotation` as member names. `update_tasks` accepts it within the existing write gate and limits. Agent writes don't notify (the existing rule that assistant writes notify nobody applies to mentions only, so assignment notifications stay as today).

## Risks / Trade-offs

- **A stale cache can briefly show the wrong next person offline.** It converges on sync, and the panel line marks a departed person as "left the project".
- **Round robin ignores fairness when people swap.** That's intentional and documented, and a manual reassignment is the escape hatch.

## Size

- Under 2 KB gzip in the task-panel chunk.
- Under 5 KB of Go.
- No migration and no new table.
