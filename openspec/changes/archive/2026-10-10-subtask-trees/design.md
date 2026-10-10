# Design

## Context

`task.parent_id` is a reserved, validated, synced field with no behavior. This change shares its core problem with `project-hierarchy`: a tree encoded as parent pointers in an LWW field store, edited concurrently, must stay well-formed without a coordinator. The two changes should share one tree builder and one cycle-breaking rule. Additional constraints here: tasks have completion, which interacts with the tree; and lists are much longer than the project sidebar, so rendering must stay linear.

## Goals / Non-Goals

**Goals:**
- Unlimited depth with the same `parent_id` field; subtree follows the parent's project.
- Progress, cascade completion and cascade deletion expressed as ordinary per-task ops.
- Keyboard-first re-parenting (Tab / Shift+Tab) and a picker.
- One generic tree module reused by projects and tasks.

**Non-Goals:**
- Rolled-up progress over all descendants (direct children only; simpler to read and to compute).
- Cross-project parents.
- Drag-and-drop re-parenting (`manual-ordering`).
- Server-side rejection of cycle-forming ops on the sync path.

## Decisions

### D1. Reuse `parent_id`; no new fields
The tree is `parent_id` plus `position` among siblings. No schema, migration, REST payload or export change.

### D2. Shared tree module
`web/src/lib/tree.ts` (introduced by whichever of `project-hierarchy` and this change lands first) exposes `buildTree(items, {id, parentId, clockOf})` returning ordered nodes with depth, plus `descendants`, `isDescendant` and deterministic cycle breaking: in a cycle, the member whose `parent_id` clock `(ts, device)` is greatest is treated as a root. Both entities use it unchanged. Alternative: a materialized `path` string per task kept in sync by the client. Rejected: a derived field written through the op log turns every move into O(subtree) ops and can itself conflict.

### D3. Cascades are explicit per-task ops
- Project move: write `project_id` (and clear any section reference, once sections exist) on each descendant in the same mutation batch.
- Complete parent: write `completed_at` on each open descendant.
- Delete parent: write `deleted_at` on each descendant.
Each task's fields remain independent LWW registers, so a concurrent edit on one descendant resolves per field. Reopen and unarchive-style operations do not cascade: resurrecting many tasks is the surprising direction.

### D4. Display rules for inconsistent states
Three states arise from partial sync or concurrency and are resolved by rendering, not by writes: parent missing locally, parent deleted, parent completed while the child is open. In all three the child renders at its project's top level with a breadcrumb when the parent is known. Writing a repair op would depend on arrival order and could undo a newer concurrent edit.

### D5. Completion of the last subtask
Auto-completing the parent is tempting but destructive under concurrency: device B may be adding a subtask at that moment. Instead the client shows a one-key prompt ("Complete 'Plan trip' too? Enter") that writes a normal completion op only on user confirmation.

### D6. Flat rendering in cross-project views
Today, Upcoming, Completed and future filter views list matching tasks flat with a parent breadcrumb. Showing partial trees there would require pulling in non-matching ancestors and conflicts with date grouping. Project and Inbox views render the tree via a single depth-first pass over the built tree (linear in task count).

### D7. REST validation
`PATCH /api/v1/tasks/{id}` with `parent_id` checks: parent exists and is not deleted, same `project_id`, and the chain from the parent does not reach the task. REST is sequential on the server, so rejecting is safe; sync ops are never rejected for tree reasons.

## Data model impact
- No new entities or fields; `task.parent_id` gains semantics. No renames. All writes through `mutate()` / `sync.Apply`.
- Dependencies: none. Container image and runtime memory unchanged. Client bundle +4–6 KB gzipped (tree module share, breadcrumbs, picker, prompt).

## Risks / Trade-offs

- [Cascade completion surprises a user who only wanted the parent gone] → the prompt names the count of open subtasks before completing; undo is a normal reopen per task until `trash-and-history` provides bulk undo.
- [Cycle breaking picks a root the user did not intend] → deterministic, visible, no data loss; one keyboard move fixes it.
- [Very deep trees on phones] → indentation capped after level 3; collapse state per device.
- [Large subtree cascades produce many ops] → one op per task, sent in outbox batches; personal data volumes keep this small.

## Migration Plan
None; all existing tasks have `parent_id = null`. Rollback: an older client shows subtasks as ordinary tasks of their project; nothing is lost.

## Open Questions
- Whether recurring tasks (`recurring-tasks`) should regenerate their subtasks on each occurrence; out of scope here, but cascade helpers should stay reusable.
