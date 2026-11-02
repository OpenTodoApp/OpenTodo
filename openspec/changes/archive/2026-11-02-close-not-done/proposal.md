# Proposal

## Why

The facet editors of the task panel (When, Assignee, Take turns, Labels) end with a button labelled **Done** that only closes the editor. On a phone the editor is a sheet right under the task's checkbox, and people read "Done" as "complete the task" (GitHub issue #801). The selection bar's **Done** sits next to ticked tasks and has the same problem, and on the Focus screen a Flowtime session's **Done** sits beside **Complete**.

## What Changes

- The facet editors' footer offers **Clear** and **Close**; the When control's own button and the "Task page published" dialog say **Close**.
- The selection mode toggle on touch reads **Select** / **Close**, and the selection bar's button that hides the checkboxes says **Close**.
- A Flowtime session's stop button on the Focus screen says **Stop the timer**.
- The design system gets a rule: a button that only dismisses a sheet, popover, panel or mode says Close, never Done.

Wording only: no data, op, route or setting changes. Not **BREAKING**.

## Out of scope

- "Done" where it confirms a choice or finishes an edit away from any task (routine pickers, the accent picker, a project note, secrets shown once in Settings), and "Done" as a status (statistics, review steps, routine runs).

## Roadmap

User feedback, GitHub issue #801. Not a ROADMAP.md row.

## Capabilities

### Modified Capabilities

- `web-app`: Facet editors are popovers (footer button reads Close).
- `start-dates`: Setting when from the panel and the keyboard (scenario wording).
- `bulk-actions`: Select with a pointer or on touch (Close hides the checkboxes).
