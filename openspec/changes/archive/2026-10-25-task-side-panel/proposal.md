# Proposal

## Why

Since 0.11.0 ("Precision") a task opens as its own page everywhere except the Inbox and Process the Inbox, which keep it beside the list. GitHub issue #365 asks for a choice: wide monitors have room for the list and the task side by side, as in 0.10, and going back and forth between a list and a page costs a move per task when reading through a project, a view or a label.

- **Choose how tasks open:** as a page (today's behaviour, and the default) or in a side panel beside the list.
- **Everything on one screen:** the panel shows the task's full details, notes and comments included, not only its date, priority and project.
- **Click or move to show:** a click on a task, or moving to it with the keyboard, shows it in the panel.
- **A panel that stays put:** it never closes by itself; once closed it stays closed until the user opens a task again.
- **Your width:** the panel can be resized, and the width is remembered.

## What Changes

- **A new preference, "Open tasks"** (appearance-preferences, new requirement "Task opening preference"): **As a page** (the default) or **In a side panel**. It is a synced, additive `user_prefs.task_open` field (`page` or `panel`), edited offline like the other appearance preferences. It lives on a new page of Settings → Appearance, **Task details** (settings-navigation, modified "Settings sub-pages").
- **Lists keep the task beside them** (web-app, new requirement "Task details in a side panel"; modified "Task detail panel"). With the side panel chosen and a window at least 1024 px wide:
  - These lists keep a side panel: Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, Next, Waiting, projects (list, board and timeline), labels, places, the Filter view and saved views.
  - The panel is the Inbox's docked task: notes, facts, custom fields, subtasks, attachments, and the Comments, Activity, History and Time tabs.
  - A click on a task, Enter on a row or moving the cursor shows that task in the panel. Enter on the row already shown opens the task page, as in the Inbox.
  - The panel is open or closed, kept on the device. Only its Close button, or Escape inside it, closes it. While closed, the cursor moves without opening it, and a click or Enter on a task opens it again.
  - With no task shown, the panel reads "No task selected".
  - Phones, windows narrower than 1024 px and the screens not listed (the calendar, Plan, Month, dashboards, the review screens) keep the page.
- **The Inbox follows the preference** (inbox-triage, modified "Inbox list and detail"). With the page preference, the Inbox keeps its own split as today. With the side panel, the Inbox uses the same panel as the other lists and keeps its own empty-pane sentence.
- **A resizable panel** (app-shell, modified "Panel width and expansion" and "The panel slot has an address"):
  - The docked task panel has a drag handle on its left edge, which is also a keyboard separator. This applies wherever a task docks: the Inbox, Process the Inbox and lists with the side panel.
  - The width is remembered on the device, and a double click or Home restores the default.

Out of scope:
- The calendar, Plan, Month, dashboards, the review screens and Close the day. They have their own panels or open the task page, and keep doing so.
- A side panel on phones or tablets narrower than 1024 px.
- Syncing the panel's width or its open state. Both are per device (design D3, D4).
- Changing the docked panel's layout. It keeps the earlier panel layout, with the notes clamped and Show more.

ROADMAP: follows up row 9 of the design refresh (Precision, 0.11.0), GitHub issue #365. There is one additive `user_prefs` field and no new environment variable, so nothing here is **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-app`: a task can open in a side panel beside every list, by preference.
- `app-shell`: the slot hosts a task on lists with the side panel, and the docked task's panel is resizable with a per-device width.
- `inbox-triage`: the Inbox's split follows the preference.
- `appearance-preferences`: the synced "Open tasks" preference.
- `settings-navigation`: Appearance gains a Task details page.

## Impact

- **Web client:**
  - `app/panel.ts`: the split's kind, the panel's open state and its width.
  - A new `app/sidePanel.tsx`: the hook the lists share, the empty pane and the resize handle.
  - `PanelHost` and `TaskDetail`: the handle and a Close that remembers.
  - `TaskListView`, `useInboxSplit`, `useListShortcuts` and `useListBindings`.
  - `useListKeys`, used by the Filter view, saved views, Next and Waiting.
  - The settings page, its copy and strings in the six languages.
- **Sync:** one additive `user_prefs.task_open` field in `internal/sync/ops.go`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. It is not content, so it is not encrypted.
- **Docs:** `docs/task-panel.md`, `docs/settings-you.md`, `docs/interface-guide.md` and the CHANGELOG.
- **Size:** no new dependency, one new interface icon (`panel-right`) and a few hundred lines of client code.
