# Assistant: suggest after adding a task

## Why

A task typed into a quick-add line is often a rough phrase ("BMW reception pneu 2", "Unscrew"). The assistant can propose a clearer title, the project it belongs in and a few subtasks, but only when someone opens the panel and asks. People who add many tasks a day never do. The panel already knows how to take a prefilled question about selected tasks ("Break down", from a task's menu) and to review, apply and undo a change set, so the missing piece is a trigger.

## What Changes

- **A per-device switch, off by default,** in Settings → Integrations → Assistant ("Suggest after adding"). It is stored on the device like "Small changes without review", never on the server.
- **When it is on and the assistant is available to the account** (turned on by the owner, consented, not an encrypted account), a task added from a quick-add line (a list's line, the add bar and palette, the mobile sheet) opens the assistant panel with a bounded question about that one task and sends it at once.
- **The question is bounded:** propose a clearer title only if it helps, the project only if clearly better, at most 4 subtasks only if the task is really several steps; change nothing else, invent no date, answer in the language of the task.
- **Nothing changes without review.** The answer is the usual change set: each item can be unchecked, Apply writes it, Undo puts it back. Small-change auto-apply keeps its own rules and never covers a new subtask or a project move (it only applies to existing tasks' completion, dates, priority and labels).
- **Adding a task never depends on the assistant:** any failure to ask is swallowed after the task exists.
- Docs: a line in the assistant settings guide; CHANGELOG `### Added`.

## Out of scope

- Asking for tasks created by anything other than a quick-add line (API, import, CalDAV, email, sync from another device).
- A server-side hook or webhook receiver: the question is asked from the device that added the task, with the person's own session.
- Choosing which lists are excluded; the question names only the new task, and the server decides what the assistant may read.

## Roadmap

Extends ROADMAP "in-app-assistant"; no new roadmap item.

## Capabilities

### Modified Capabilities

- `in-app-assistant`: a quick-add line can ask the assistant about the task it just created.
