# Assistant: suggest after adding a task

## Why

A task typed into a quick-add line is often a rough phrase ("BMW reception pneu 2", "Unscrew"). The assistant can propose a clearer title, the project it belongs in and a few subtasks, but only when someone opens the panel and asks. People who add many tasks a day never do. The panel already knows how to take a prefilled question about selected tasks ("Break down", from a task's menu) and to review, apply and undo a change set, so the missing piece is a trigger.

The same assistant also stops too early on a request that needs several steps: the turn allows 8 model calls, and a request such as "plan this week, then break down the three biggest tasks" reaches `round_limit` before it can answer. Twelve calls leave room for the extra rounds without letting a turn run away.

## What Changes

- **A per-device switch, off by default,** in Settings → Integrations → Assistant ("Suggest after adding"). It is stored on the device like "Small changes without review", never on the server.
- **When it is on and the assistant is available to the account** (turned on by the owner and consented, whether the server answers the turn or the account's assistant runs on the device), a task added from a quick-add line (a list's line, the add bar and palette, the mobile sheet) opens the assistant panel with a bounded question about that one task and sends it at once.
- **The question is bounded:** propose a clearer title only if it helps, the project only if clearly better, at most 4 subtasks only if the task is really several steps; change nothing else, invent no date, answer in the language of the task.
- **Nothing changes without review.** The answer is the usual change set: each item can be unchecked, Apply writes it, Undo puts it back. Small-change auto-apply keeps its own rules and never covers a new subtask or a project move (it only applies to existing tasks' completion, dates, priority and labels).
- **Adding a task never depends on the assistant:** any failure to ask is swallowed after the task exists.
- **Twelve model calls per turn.** `MaxRounds` rises from 8 to 12 on the server and in the on-device manifest, the system rules tell the model to read in one step and send independent tool calls together, and `docs/api.md` names the same number. A tool-use answer on the 12th call still stops the turn with `round_limit` and no change set; an `end_turn` on the 12th call keeps its change set.
- Docs: a section in the assistant settings guide; CHANGELOG `### Added`; regenerated `web/src/generated/help.json`.
- i18n: the switch label, its row label and its description in the six catalogues.

## Out of scope

- Asking for tasks created by anything other than a quick-add line (API, import, CalDAV, email, sync from another device).
- A server-side hook or webhook receiver: the question is asked from the device that added the task, with the person's own session or its on-device assistant.
- Choosing which lists are excluded; the question names only the new task, and the server decides what the assistant may read.
- Raising the budget again automatically or making it a server setting: 12 is fixed and documented.
- Changing auto-apply, the review card or the Undo path.

## Roadmap

Extends the 1.0 roadmap's `in-app-assistant` (ROADMAP.md, line 263) and the same item's `assistant-on-device` behaviour. No new roadmap item.

## Capabilities

### Modified Capabilities

- `in-app-assistant`: a quick-add line can ask the assistant about the task it just created, and a server or on-device turn may use 12 model calls.
