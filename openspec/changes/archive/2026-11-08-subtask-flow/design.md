# Design: subtasks one at a time

## D1. A field on the parent, like a project's

The parent says how its children flow, exactly as a project and a section do, with the same field name and values (`flow_mode`, `""`/`parallel`/`sequential`; `area` makes no sense for a task and reads as parallel). It is not inherited: each level of the tree chooses, which is the issue's example (a sequential task whose first step is a parallel task whose children are parallel tasks).

## D2. The rule: nearest parent first

For an open task, walk up the parents (at most 64 levels). At each step from a child to its parent: if the parent is sequential and the child is open and not skipped, the parent's first open, not-skipped subtask in list order (position, then id) is the only one offered; any other child waits, held by that first subtask (`{kind: task}`), and so does everything under it. The first hold found walking up wins, so the "After …" marker names the nearest step. If nothing holds the task on the way up, the top-level task's place in its project's sequence decides, as before.

A completed or deleted subtask is not a candidate, so completing the first offers the next at once, offline included. A parent with no open candidate holds nothing. The parent itself stays available: it is the plan, not a step.

The web app computes the first subtask of every sequential parent once per flow state, lazily. The incremental update (`FlowState.next`) treats any change to a sequential parent's flow or to one of its subtasks as "cannot say", so the list re-evaluates those rows.

## D3. Where it is set

One switch, **One at a time**, in the head of the subtasks block on the task page and in the docked panel, shown with two subtasks or more (one subtask is no sequence) and in every "How you work" mode: it sits where the subtasks are, so it adds no menu item and nothing to the rows. Turning it on or off is one operation with Undo. A viewer of a shared project sees it only while it is on, disabled, so the dimmed subtasks have an explanation.

## D4. 1.x compatibility

A 1.0 or 1.1 client stores the unknown field like any other and ignores it: it shows every subtask as available and writes nothing to normalise it. A newer client's unknown value reads as parallel. No migration: the materialized rows carry the field with its default.

## Interface budget

No chrome above the list, no new row property (the "After …" marker is the existing one and does not count), no shortcut, no scroll region. On the task page the switch sits in the subtasks block's existing head row.

## Data model

One additive string field on tasks, default `""`, not content, never encrypted, in the export. Written through the op log, converging by last-writer-wins like every field.

## Size

A few hundred bytes in the shared rule and the subtasks block, which load with every list and the task panel.
