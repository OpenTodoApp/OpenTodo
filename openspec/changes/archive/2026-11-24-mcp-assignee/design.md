# Design

## Context

- A task's assignee is the plaintext op field `assignee_id` (`task-assignment`). The sync resolver refuses it with `not_a_member` unless the account is a current member of the task's shared project, or the author in their personal scope (`canBeAssigned`), and the role table refuses viewers (`CanWrite`). REST writes it through `ApplyStrict` with those checks.
- The agent tool planners in `internal/agenttools` validate against the caller's snapshot and return a change set; the registry applies it as the token's device through the same op path. The snapshot already holds each shared project's members (rotation).

## Decisions

**D1. One `assignee` argument, named the way people name people.** Both tools take `assignee`: an account id, an email or a name, or `me`. Assistants know people by name or email, not by account id; `get_task` shows the id and name for an existing assignee. Resolution looks only among the people the task can be assigned to: the current members of its shared project (id, then email, then name, ignoring case; a name two members share is refused, asking for the email or id), or the user alone for a personal task. `null` unassigns. Because nobody outside that set can be matched, a non-member is refused before anything is planned, with a JSON-RPC `-32602` error naming the argument, as a rotation naming a non-member is.

**D2. The same checks as REST, twice.** The planner adds `assignee_id` to the task's patch, so the existing role check refuses a viewer with `forbidden` for the whole call. The applied op then passes the sync resolver's membership check like any device or REST write, so a membership that changed between planning and applying is still refused.

**D3. Ordinary operation.** No new field: `assignee_id` already exists. The assignment notifies the assignee (the token's account is the author) and converges by last-writer-wins.

## Data model

None. `assignee_id` is an existing, plaintext op field; nothing is added to the op schema.

## Size

No dependency; no change to the image size or runtime memory beyond a member list per shared project held for one call.
