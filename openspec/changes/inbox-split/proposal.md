# Proposal

## Why

This is part 7 of the "Precision" redesign build plan (`design-references/round2/README.md`, row 7; mock-up `inbox-triage.png`). It follows `task-full-page`, which made a task open as its own page everywhere and kept a split only for Process the Inbox.

The Inbox is the one list whose job is deciding, task after task, where each thing goes. Opening every task as a page and coming back costs two moves per task. Decision 7 of the round-2 README says "Triage keeps its split": the Inbox is the one list with a permanent detail pane, as in Linear's inbox (reference 01).

- **"The space is all used, I feel in control":** on a wide screen the list sits on the left and the task under the cursor on the right. There is no trip to a page and back.
- **Where it came from, at a glance:** each Inbox row says where its task came from and when ("From email · 3 d ago"). The user knows what they are deciding about before opening anything.
- **One clear way on:** Process is the page's primary action, on `P`.

## What Changes

- **The Inbox is list | detail from 1024 px** (inbox-triage, new requirement "Inbox list and detail"):
  - The Inbox keeps a detail pane beside its list, in the shell's panel slot, about half the content's width.
  - The task under the cursor shows there. `j` and `k` (and the arrow keys) move the cursor and the pane follows. A click on a row shows its task there.
  - With no task under the cursor, the pane reads "No task selected", with a sentence that names the two ways on: select a task, or press `P` to process them all, one at a time.
  - Enter on a row whose task is shown opens the task as its page (task-full-page's page, with its "4 / 12" and Esc back to the Inbox).
  - Escape, the pane's Close, or a click on the empty part of the list clears the cursor and empties the pane.
  - A click on a title shows the task beside the list, not the inline editor; the title is edited in the pane.
  - An empty Inbox shows its own empty state and no pane.
  - Below 1024 px the Inbox is a plain list and a task opens as its page, as everywhere else.
- **Process is the primary action** (inbox-triage, modified "Entering and leaving the triage mode"):
  - The header's Process control becomes the primary button, "Process" with its key `P`.
  - `P` on the Inbox opens Process the Inbox. `g` then `p` still opens it from anywhere.
  - The number of tasks moves to the header's meta: "4 to sort".
- **Source lines** (inbox-triage, new requirement "Inbox source lines"): each top-level Inbox row has a quiet second line under its title saying where the task came from and when.
  - The source comes from the task's origin when it has one: "From email", "From email (Gmail)", "From example.org", "From acme/app#12", "Imported from todoist".
  - Otherwise it comes from what wrote the task's creation: "From a calendar app", "Added by an AI assistant", "Added through the API", "From a Markdown vault", "Imported".
  - A task made in the app says "Added".
  - The time is relative: "2 h ago", "3 d ago", or the date after a week.
  - The line stands in for the origin chip on Inbox rows (task-list-presentation, modified "Metadata language"). The task page and the docked task still show the origin with its link.
- **The task page rule names the Inbox** (web-app, modified "Task detail panel"): the pages that keep a split are Process the Inbox and the Inbox.

Out of scope:
- The Display button of the mock-up's header. The Inbox keeps its existing menu; `views-and-display` did not give list pages the display panel.
- The mock-up's "Added by voice" and "Quick add" sources. Neither is recorded on the task, and recording them would need a new field.
- Any change to the triage mode itself (its card, its keys, its decisions).
- The phone's Inbox, which is `precision-phone`.

ROADMAP: advances the Precision redesign (round-2 build plan, change 7). There is no new environment variable, no new field and no op-log change, so nothing here is **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities
- `inbox-triage`: Process is the Inbox's primary action on `P`, and the count moves to the header's meta. New requirements cover the Inbox as list | detail and the source lines.
- `web-app`: the Inbox joins Process the Inbox as a page that keeps a split.
- `task-list-presentation`: Inbox rows show the source line instead of the origin chip.

## Impact

- **Web client:**
  - The Inbox page (`TaskListView` and a new `useInboxSplit` hook) and the shell's panel slot (`panel.ts`, `PanelHost`, which can now hold the empty pane).
  - The row's source line (`TaskRow`, with `lib/taskSource.ts`).
  - The list's Enter and Escape on a split.
  - The header's Process control, one new shortcut registry entry (`inbox.process`), and strings in five languages.
- **Docs:** `docs/inbox.md`, `docs/keyboard.md`, and the CHANGELOG.
- **Server, sync and API:** no changes.
- **Size:** no new dependency, and a few hundred lines of client code.
