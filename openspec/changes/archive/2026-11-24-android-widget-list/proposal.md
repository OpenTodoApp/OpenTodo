# Proposal

## Why

The Android Today widget shows at most five lines of plain text and a count ([#1240](https://github.com/OpenTodoApp/OpenTodo/issues/1240), from discussion #464). People want what a task-list widget usually gives: the whole of Today in a list that scrolls, a tick to complete a task without opening the app, a way to add one, and something that looks at home in light and dark and at any size. The issue's comments propose more (a view selector per widget, Reschedule for Earlier, a compact mode); this change builds the list itself so those can follow on top of it.

## What Changes

- The Today widget becomes a **scrollable list** of every task the web app publishes (up to 50), grouped as **Earlier** and **Today** when both exist, each row showing the title and, when set, the time, the overdue date and the project.
- Each row has a **completion circle**. A tap hides the row at once and queues the completion for the web app: a one-shot background run opens the app hidden at `/?complete=<id>`, and the web app completes the task through `completeTask`, the same op path a tap in the app takes (a repeating task moves to its next occurrence). Offline, the op waits in the outbox like any other. The shell never writes task data itself.
- A **+** in the header opens quick add, so one widget does what two did (the separate Quick add widget stays for people who placed it).
- An **empty state** ("Nothing left for today"), the existing "open the app" and locked states, light and dark from the theme's colours, and a layout that works from 2×2 to full screen.
- The web app adds two optional row fields (`project`, `date`) and `actions: ["complete"]` to the widget publication. A shell draws circles only when the publication lists `complete`, so a newer app on an older server stays read-only.

Out of scope (follow-ups on this list): choosing a view per widget (Inbox, Upcoming, a project, as #1240's comment proposes, and the Upcoming and calendar widgets of #1718), Reschedule for Earlier, compact mode, and completing from the iOS widget (WidgetKit App Intents). No **BREAKING** change: no new environment variable, no op-log change, no new permission.

Roadmap: none of the open rows; like `completed-widget`, an issue-driven change to the native shells.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the Widgets requirement (the Today widget scrolls, completes and adds).

## Impact

- Web: `shellWidget` (row `project` and `date`, `actions`), `shellActions` (`?complete=`, applied only in a background run), `shellBackground` (waits for it), bridge fixtures.
- Android: `WidgetModel` (all rows, groups, pending completions), `Widgets.kt` (a `RemoteViewsService` list, a receiver for row taps), two row layouts, a circle drawable, strings in every language, the manifest. No dependency: `RemoteViewsService` is in the platform since API 11.
- Docs: `docs/android-app.md` Widgets, `mobile/README.md`.
