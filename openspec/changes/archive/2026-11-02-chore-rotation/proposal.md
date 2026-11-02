# Proposal

## Why

Shared households run on chores that repeat and pass from person to person: bins on Monday, the bathroom on Saturday, the cat's litter every other day. Donetick wins self-hosters for exactly this (research §1 "Donetick", §4 P4.3 "allow recurring tasks shared with a Workspace Group (@Household) to rotate assignees automatically upon completion"). OpenTodo has the parts: recurring tasks, shared projects, groups and assignees. But a recurring task keeps its assignee forever, so "whose turn is it" lives in someone's head or in a manual reassignment after every completion.

## What Changes

- **A rotation on a recurring task in a shared project.** The new additive op field `rotation` holds an ordered list of member account ids: the people who take turns.
  - **Where to set it:** the task panel's Assignee menu gains "Take turns…". It opens a people picker with drag-to-order and an "Add everyone in <group>" entry for each workspace group on the project, which adds the group's current members at that moment.
  - **When it shows:** only when the task repeats and the project has at least two members.
- **Completion passes the turn.** Completing the current occurrence writes the completion record and the next due date as today, and also sets the series' assignee to the next person in the rotation.
  - The next person is the one after the current assignee, among the rotation's current members. It wraps around, and starts at the first person when the current assignee is outside the rotation or empty.
  - The choice is a pure function of the rotation, the current assignee and the membership. Two devices completing the same occurrence offline therefore write the same assignee and converge, like the occurrence record and the next due already do.
  - The function is shared by Go and TypeScript and pinned by vectors. The REST API, CalDAV, the MCP tools and automation rules all complete through the server's copy.
- **Skipping and detaching don't pass the turn.** Skip and "This occurrence only" leave the assignee unchanged. Only completions rotate.
- **The new assignee is notified** through the existing assignment notification (in-app, push and delivery channels), as when someone assigns them.
- **Membership changes repair the rotation.** When a member leaves, is removed or their account is deleted, the server, in the same server-authored batch that today unassigns them:
  - removes them from every rotation in that project;
  - hands any rotating task they held to the next person instead of leaving it unassigned.
- **Visible but quiet.**
  - The row shows the assignee's avatar with a small rotate mark.
  - The task panel shows "Takes turns: Alice → Bob → Carol", with the next person in bold.
  - Assigned to me lists a rotating task only for the person whose turn it is.
- **API, CLI and MCP.**
  - `rotation` is a task field in REST reads and writes. A write is refused 409 `not_a_member` when it names a non-member, and 400 `invalid_rotation` when it has duplicates, more than 20 people, or is set on a task without a rule or outside a shared project.
  - `ot task edit <id> --rotate alice,bob` / `--no-rotate`.
  - The MCP task view shows the rotation, and the existing `update_tasks` write tool accepts it.

No new route, no new environment variable, no new dependency. One additive task field. Not **BREAKING**.

## Out of scope

- **Weighted or load-balanced rotation:** "whoever did it least", points, or skipping someone on holiday. A rotation is a plain round robin, and a manual reassignment works for exceptions.
- **Rotations that follow a group's membership live.** The group only fills the list once (see design D2).
- **Rotation on non-recurring tasks, subtasks of a series, or personal projects.**
- **Mapping to CalDAV or the vault.** `rotation` is not exported to VTODO or Markdown. Completion through CalDAV still rotates.
- **Automation rule actions that set a rotation.** Rules keep their `assignee` action.

## Roadmap

Advances ROADMAP-1.0 milestone 0.21 "Horizons and home", item `chore-rotation` (research P4.3 "Rotating Chore Assignees"). No linked issue.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-assignment`:
  - ADDED "Rotating assignee on recurring tasks", "Completion passes the turn", "Rotation in the client" and "Rotation through the API".
  - MODIFIED "Unassign on departure", so that rotating tasks are handed on instead of unassigned.

## Impact

- **Data model and sync:** one additive task field, `rotation` (id list, default `[]`), declared in `internal/sync/ops.go` `Schema`. It is a whole-list register (LWW) like `blocked_by`. At receipt, `Apply` checks that every id is a current member of the task's scope, as for `assignee_id`. Account ids are plaintext like `assignee_id`, so it is not an E2EE content field.
- **Derived logic:** `nextAssignee(rotation, current, members)` in `web/src/lib/rotation.ts` and `internal/sync` (server completion in `recurring.go`), with shared vectors in `web/src/lib/rotation.vectors.json`.
- **Server:** recurring completion in `internal/sync/recurring.go` (used by REST, CalDAV, MCP and rules) writes the next assignee. The departure path in membership code writes rotation and assignee repairs. The webhooks and the activity log see ordinary assignee changes.
- **E2EE:** unaffected. The ids are plaintext, and titles stay encrypted.
- **CalDAV and vault:** no mapping. Completing through CalDAV rotates on the server.
- **Bundle and binary size:** under 2 KB gzip in the task panel chunk, and a few KB of Go.
