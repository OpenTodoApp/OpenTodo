# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **List fields are whole-array registers.** `task.labels`, `view.panels` and `comment.mentions` are `kStringList` (`internal/sync/ops.go:154,213,242`): the server checks only "array of strings" (`checkKind`, `ops.go:374-378`) and LWW replaces the whole array (`writeOp`, `service.go:304-342`). `setPanels` in `web/src/lib/views.ts:179-199` is the client pattern: read and write in one Dexie transaction, validate, write the whole list.
- **References between tasks are derived, never repaired.** `task.parent_id` makes a tree; a missing, deleted or completed parent lifts the child to the top level, and a cycle produced by two offline moves is broken identically everywhere by the member with the newest `parent_id` clock (`web/src/lib/tree.ts:61-98`, `docs/sync.md` "Trees: subtasks"). The REST API additionally rejects a `parent_id` that would close a cycle, "because REST requests are sequential against current state; sync batches are never rejected for tree reasons".
- **The server can refuse one op of a batch with a reason and hand back the current value.** `resolve` in `internal/sync/scope.go:269-326` returns `forbidden`, `scope_change` or `not_a_member` (the assignee check reads membership, `canBeAssigned`, `scope.go:328-346`); `apply` lists the refusal and `restoreOps` adds the winning op so the device drops its edit (`service.go:233-241, 263-266`, `scope.go:349-409`). REST maps the reasons in `writeOps` (`internal/httpapi/server.go:1510-1530`).
- **Resolution happens per scope.** A task's scope is its project's shared scope or the author's personal scope (`scopeOfChild`); materialized values live in `scope_fields` keyed by scope (`writeOp`). A move between differently shared projects is a copy plus a tombstone (`moveTaskAcrossScopes`, `ops.ts:652`; `COPY_FIELDS`, `ops.ts:582`).
- **Server-side events after commit.** `emitAssignments` (`internal/sync/assign.go:26-57`) reads the committed changes, resolves names and hands a `notify.Assigned` to the sinks; `MentionSink` shows how a new event kind is added without touching existing sinks (`internal/notify/notify.go:59-95`). The in-app sink stores a row per recipient (`internal/notify/inapp.go`), the bell renders by kind (`web/src/app/NotificationBell.tsx:55`).
- **Activity is classified by field on both sides** from one ordered switch (`internal/activity/activity.go:202-218`, `web/src/lib/activity.ts` `finish`), pinned by `internal/activity/testdata/activity_fixture.json`.
- **Filters** compile keywords in `web/src/lib/filter/parse.ts` (`SIMPLE_KEYWORDS`, line 159) and `evaluate.ts` (`case 'keyword'`, line 162); the compiler gets a `FilterContext` with labels and projects but not the task set, which `blocked` needs.
- **Rows and cards** are one component, `web/src/app/TaskRow.tsx` (`card` prop for the board); the Today view groups `overdue` and `today` in `TaskListView.tsx:219-224`.
- **CalDAV** keeps every `RELATED-TO` that is not the parent in `ical_extra` (`internal/caldav/vtodo.go:353-358`) and resolves parent UIDs through a UID table that tolerates parents not uploaded yet (`docs/caldav.md:67`).
- **Importers** write ops in phases through the job (`internal/importer/plan.go`, sections at line 823); the own-export profile carries every schema field.

## Goals / Non-Goals

**Goals:**
- A dependency costs one op and no repair writes; the blocked state is a pure function of local rows.
- No synced state ever contains a cycle: the server refuses them; the device refuses them first and tolerates a transient one.
- The feature reads the same on list rows, cards, Today and the detail panel, and can be filtered.

**Non-Goals:**
- Transitive scheduling, critical path, auto-complete, auto-reschedule.
- Push delivery of the unblocked notification (the bell only; `reminders` owns push).
- Cross-scope dependencies.
- A `blocking` filter term or "Blocks" counts on rows (the detail panel lists dependents).

## Decisions

### D1. `task.blocked_by` as a bounded id list, a whole-list register

A new kind `kIDList` in `ops.go`: a JSON array of distinct strings, each non-empty and at most `MaxIDLen`, at most `MaxBlockedBy = 50` entries; `Validate` also refuses the task's own id. `Schema["task"]["blocked_by"] = kIDList`. The client type is `blocked_by: string[]` with default `[]` in `TASK_DEFAULTS`; rows synced before the field existed read as `[]` like `labels`. One LWW register: two devices editing the list offline end with the newer list (the same trade-off as labels and panels, `docs/sync.md` "panels"). Every client write goes through a helper `setBlockedBy(taskId, ids)` in a new `web/src/lib/dependencies.ts` that reads the task and its scope inside `db.transaction('rw', mutationTables(), …)` like `setPanels`, applies D3 and D4, and calls `mutate('task', id, { blocked_by })`.

- **Alternative: one `dependency` entity per edge** (`{from, to, created_at, deleted_at}`). Rejected. It adds an entity to every map (`tableFor`, `e2eeSync`, `assistant`, export, importer, purge cascades) for a list that is almost always empty or tiny, and two devices adding different edges would merge, which is nicer, but a cycle formed by two concurrent edges could then exist in synced state and need breaking forever. One register keeps the invariant "synced state has no cycle" cheap (D4).
- **Alternative: an inverse `blocks` field as well.** Rejected: two registers for one relation would disagree under concurrency. "Blocks" is derived (D2).

**Data model impact:** one additive task field. No existing field renamed or retyped. Not user-written content: stays out of `e2ee.ContentFields` and `CONTENT_FIELDS`, plaintext for encrypted accounts like `labels`. `COPY_FIELDS` (`ops.ts:582`) does not include it, so a cross-scope move copies without blockers (spec "Move across scopes"). The field joins `history.ts` field labels (line 48), `docs/sync.md`, `docs/api.md` and the export automatically (generic over `Plural`). The in-app assistant's change rendering (`assistant.ts:243`) gets a line for it; assistant, MCP and `ot` write tools keep their explicit field allow-lists (`agenttools/write.go:557`, `agent_rest.go:301`, `cli/gate.go:82`), so they refuse it, as the proposal scopes.

### D2. Blocked is derived on the device

`dependencies.ts`:

```
openBlockers(task, byId): Task[]        // ids in blocked_by that resolve to a live, open task
isBlocked(task, byId): boolean
dependents(taskId, tasks): Task[]       // tasks whose blocked_by contains taskId (the "Blocks" list)
blockedMap(tasks): Map<id, number>      // open-blocker count per task, one pass
```

`byId` is the live task map every view already builds (`taskMap` in `TaskListView`, `CalendarView`); `visibleTasks()` excludes tombstones, so deleted and purged blockers drop out, and `completed_at !== null` excludes completed ones. Unknown ids do not block (spec "Blocker not received yet"): the same choice as a parent not received, and the only convergent one, since a device cannot tell "not yet" from "purged". A recurring blocker stays open across completions (its occurrence record is a separate task), so it keeps blocking until its series ends; the detail row says "repeats" next to such a blocker.

`blockedMap` runs over the view's task array once per render, like `progressMap` in `lib/subtasks.ts:27`; it is O(tasks + edges) and most tasks have no edges.

### D3. Picker exclusions and the local cycle check

`setBlockedBy` refuses, with a thrown message like `setPanels`, an id that is the task itself, a task outside the task's scope (D5) or one from which the task is reachable through `blocked_by` edges (`reaches(from, to, byId)`, a DFS over the scope's edges including deleted and completed tasks, since those are structural). The picker (the same component as "Parent task", `task-detail/Properties.tsx`; built on the `entity-pickers` capability of `task-detail-redesign` when it lands, the current picker otherwise) is fed `blockerCandidates(task, tasks)`: open, live tasks of the same scope, minus the task, its current blockers and `dependents*` (the transitive closure). It shows the project › section path like the parent picker.

A cycle can still exist locally for a moment (a remote edge arrived while the user was choosing, or two local edits before the server's answer). `isBlocked` therefore ignores, within each cycle, the edges of the member whose `_clock.blocked_by` is newest under `(ts, device, id)`, the rule of `effectiveParents` (`tree.ts:76-96`), implemented once as `brokenEdges(tasks)` and consulted by `openBlockers`. The server's refusal (D4) then removes the losing edge for good.

- **Alternative: let the server be the only guard.** Rejected: offline users would see a self-blocking pair until the next sync, and the picker would offer choices that get refused later.

### D4. Server refusal of cycles and the convergence story

In `resolve` (`scope.go`), for `op.Entity == "task" && op.Field == "blocked_by"`:
1. Parse the list (already validated by `Validate`).
2. Load the scope's current graph lazily, once per batch: `SELECT entity_id, value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND field = 'blocked_by'`, into `map[id][]id`, overlaid with the `blocked_by` ops of this batch accepted so far (the resolver already pre-scans the batch for `project_id`, `newResolver`, `scope.go:160`).
3. For each id in the list: if the server knows the task and its scope differs, refuse with `ReasonNotInScope` (D5). If it does not know the task, accept (it may arrive in a later batch; it cannot be part of a cycle the server can see).
4. With the op's list substituted for the task, DFS from the task along the overlay; reaching the task again refuses with `ReasonCycle`.

Deletion and completion are ignored: the graph is structural, so a reopen can never surface a cycle. The refusal goes through the existing path: listed in `rejected`, `restoreOps` adds the current winning `blocked_by` op (task fields are already covered, `scope.go:367-375`), and the device applies it over its local value with the server's clock. `writeOps` in `server.go` maps both new reasons to `400 invalid_input` with a message that names the offending id.

**Convergence.** Synced state is cycle-free by induction: the empty graph is, and every accepted op was checked against the graph that includes every op accepted before it (within a batch too). Two offline devices that each add one half of a cycle: the first batch to reach the server is accepted, the second is refused, its device receives the restore op and drops its edge; a third device only ever sees the accepted half. The usual `(ts, device)` winner rule is not involved in choosing which half survives, arrival order is, and that is deliberate: the alternative, accepting both and breaking the cycle on read everywhere, would leave a permanent cycle in the log and make every reader run the breaker. The spec states arrival order ("A syncs before B").

A device talking to an **older server** (no `blocked_by` in `Schema`) gets the whole batch refused as `invalid_op` like any additive field; the sync loop's invalid-op path applies, and the release notes say the server must be upgraded first (the server and client ship in one binary).

- **Alternative: reject cycles only on REST, like `parent_id`.** Rejected. For trees a cycle has a cheap, local breaker and a visible result (a task at the top level). A dependency cycle has no visible position to break at and would silently keep two tasks blocked forever on a device that lost; refusing it costs one SELECT per batch that writes `blocked_by`.

### D5. Same sharing scope only

A blocker must be in the task's scope (spec "Blockers stay within the sharing scope"). On the device, `scopeOf(task.project_id, memberships)` (`lib/sharing.ts`) compares the two tasks; on the server, `existingTaskScope(id)` (`scope.go:214`) does. `moveTaskAcrossScopes` already copies without `blocked_by` (D1), so the copy starts clean; references *to* the moved task from its old scope now point at a tombstone and stop blocking by D2, with no write. Dependents are not rewritten: a repair would depend on arrival order.

- **Alternative: allow cross-scope and ignore what a member cannot see.** Rejected: two members of one project would disagree on whether a task is blocked, which reads as a sync bug.

### D6. Filter terms need the task set

`blocked` and `unblocked` join `SIMPLE_KEYWORDS` and `Keyword`. The compiler needs the live task map, which `FilterContext` lacks; `compile` gains an optional `tasks?: readonly Task[]` on the context (the `ViewContext` already carries it, `views.ts:243`) and builds `blockedMap` once per compile. The Filter view and saved views pass `ctx.tasks`; a caller without tasks (none today) treats every task as unblocked and the compiler warns once. Both terms match open tasks only by default, like every keyword (`mentionsState`).

### D7. Presentation: rows, cards, Today, detail panel

- `TaskRow` gains `blockedBy?: number` (open blockers, from `blockedMap`); when > 0 the title gets `text-muted` and a `<Icon name="lock" size="xs">` marker with `aria-label="Blocked by 2"` next to the due label. The board renders rows through the same component (`renderCard`, `BoardView.tsx`), so cards follow. No new colour: dimming uses the existing muted token.
- Today (`TaskListView.tsx:219-224`): a third group `blocked` after `today`, heading "Blocked N", collapsed by default; the collapse flag lives in the per-device `collapsed` meta the list already keeps for sections. Upcoming and the rest dim in place.
- `task-detail/Properties.tsx`: a `PropertyRow icon="lock" label="Blocked by"` whose editor is the parent-task picker in multi-select mode writing through `setBlockedBy`, listing current blockers as chips (completed ones struck through, with a "repeats" hint for a series), and a read-only `PropertyRow label="Blocks"` listing `dependents` as links that call `onOpen`. `b` on a selected row goes through a signal like `estimateFocus` (`app/signals.ts`) so the panel opens with the picker focused; the shortcut is added to `lib/shortcuts.ts` (section `tasks`), and `make docs` regenerates `docs/keyboard.md`.
- Vim mode: `b` is not a Vim motion in the app's set (`web-app` "Normal-mode motions"), so no clash.

### D8. Activity kind `dependencies`

Both classifiers gain `case has("blocked_by"): kind = "dependencies"` after `project_id` and before `archived` (`activity.go:214`, `activity.ts` `finish`). `ActivityKind` gets `'dependencies'`; the task panel's Activity tab words it ("changed what this task waits for"), with the lists rendered as task titles when known. One fixture case ("blocked_by with title in one window") pins both sides. Webhooks already emit `task.updated` for any field (`webhooks` "Events derived from operations"); nothing to add.

### D9. Unblocked notification

`notify.Unblocked{AssigneeID, ActorID, ActorName, TaskID, TaskTitle, ProjectID, ProjectName, BlockerID, BlockerTitle, At}` and an optional `UnblockedSink` interface, fanned out by `Multi` like `Mentioned`. After commit, `emitUnblocked` (next to `emitAssignments`, `assign.go`) looks at changes where `completed_at` went from null to a value, finds tasks in the same scope whose `blocked_by` contains the completed id (`SELECT entity_id, value FROM scope_fields WHERE scope_id = ? AND entity='task' AND field='blocked_by'`, filtered in Go; one query per batch with completions), and for each candidate that is open, not deleted, has every remaining blocker completed or deleted, and has an `assignee_id` that is neither empty nor the actor, emits once. The in-app sink stores kind `unblocked`; the bell renders "Alice completed Confirm dates — Book flights is unblocked". Best effort, like assignments: it reads the stored state and can never fail the batch. Personal scopes rarely qualify (the assignee is the author), which is the intended smallness.

- **Alternative: no notification.** Considered; the roadmap frames dependencies for small teams, where "you can start now" is the whole point. The cost is one query per batch that completes something.
- **Alternative: notify on the device from local derivation.** Rejected: the device of the blocked task's assignee would have to notice the transition itself, which needs per-device state and fires once per device.

### D10. CalDAV and import

- **CalDAV.** `Encode` adds `RELATED-TO;RELTYPE=DEPENDS-ON:<uid>` per blocker, resolving task ids to UIDs through the same table as `ParentUID`. `Decode` takes `RELTYPE=DEPENDS-ON` lines into `in.DependsOn []string`; `caldav_write.go` resolves each UID to a task id in the same calendar scope and writes `blocked_by` as one op when the list differs; unresolved UIDs go back to `extra`, as today for every unknown line. An id that resolves but sits in another scope is left in `extra` too, so the server never has to refuse a PUT for it. The cycle refusal (D4) can still reject a PUT; it maps to the existing 403 precondition answer for refused writes.
- **Import.** The own-export profile passes `blocked_by` through like every schema field, with ids remapped like `section_id` and `parent_id` when the job re-ids rows. For profiles with relations the plan gains a final pass that writes `blocked_by` ops after every task op of the job (the job already runs phases); references outside the file and cycles (checked in the plan with the same DFS, on the file's rows) become row warnings. The Linear mapping of `Blocked by` is a one-line change in that profile once `named-importers` lands; if this change archives first, the task is left for that change and noted in tasks.md.

## Risks / Trade-offs

- **[Whole-list LWW loses a concurrent addition]** → Documented like labels and panels; the detail panel rewrites the list from a fresh read inside one transaction so sequential edits on one device never lose an entry. Two devices adding different blockers at once is rare and visible (both see the result).
- **[A refused edge surprises the user who lost]** → The restore op replaces the local value and the sync status's rejection path already surfaces "a change was refused"; the detail panel shows the current list. The spec names arrival order so testers do not expect the clock rule.
- **[Blocked tasks hidden in Today's group are forgotten]** → The group shows its count in the heading and the tasks stay in Upcoming, project lists and `blocked`; the group is collapsed per device, not removed.
- **[Server DFS cost on a large scope]** → The graph is loaded once per batch that writes `blocked_by`, holds only tasks with a non-empty list, and the DFS is bounded by 50 edges per node. No cache, no memory impact between requests.
- **[`b` collides with a future shortcut]** → `b` is unused today in every section of `lib/shortcuts.ts`; recorded there so the next change sees it.
- **[Picker needs `entity-pickers` from `task-detail-redesign`]** → The row uses whatever picker the Parent row uses at implementation time; the spec is written for behaviour, not the component.

**Size:** no dependency. Client: about 2–3 KB gzipped (derivation, filter terms, rows, two property rows). Server: a few hundred lines of Go; binary growth negligible; runtime memory unchanged (no new cache or goroutine).

## Migration Plan

No data migration: an absent `blocked_by` reads as `[]`. Rollback is shipping the previous binary: old clients ignore the field, the old server refuses new `blocked_by` ops as `invalid_op`, and stored values stay inert in the log. The notifications table needs no change (kind is a string, `inapp.go:28`).

## Open Questions

- Should `ot` and the MCP `update_tasks` tool accept `blocked_by` later? Both keep explicit allow-lists on purpose; adding the field is a one-line change in a later change without touching these specs.
