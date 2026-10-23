# Proposal

## Why

Three small things in the owner's feedback of 2026-10-23 make the list feel less finished than it is:

- **A row's empty area does nothing.** Clicking a task row anywhere except the title, checkbox and small controls (the padding, the gaps, the leading slot, the space at the end where the project name or the revealed actions sit) neither opens the task nor clears the selection. The owner likes the "Click a task to" choice for the title, but expects a click elsewhere on the row to always open the panel.
- **Clickable things show the arrow cursor.** Tailwind 4 resets buttons to `cursor: default`, and only about two dozen places add `cursor-pointer` by hand. Buttons, menu items, row controls, sidebar entries, tabs and calendar blocks all show the arrow. The owner asks that every clickable area show the hand.
- **Empty lists offer a button that repeats the field above it.** An empty Inbox, Today, Upcoming, Anytime, Someday, project, label or place reads one sentence and an "Add a task" button, but the page already shows its own quick-add field right above. The button only focuses that field (or opens the quick-add sheet on a phone, where the field is also in the top rows), so it reads as a second, mysterious way to do the same thing.

## What Changes

- **Row empty area opens the panel.** A click (a release without a drag) on any part of a list row or board card that is not a control selects the task and opens it in the panel, whatever the "Click a task to" setting and the pointer type. The title keeps its behaviour (edit in place or open, per the setting); the checkbox, the chevron, the selection box, the project and origin links and the revealed actions keep theirs. Shift and Ctrl/⌘ on the empty area tick the row as they do on the title. Keyboard behaviour is unchanged. Compact calendar rows are unchanged.
- **One pointer rule.** A base rule in `web/src/index.css` gives `cursor: pointer` to enabled buttons, `role=button`, menu items, tabs, options, `summary`, labels of controls, links and task rows, at zero specificity so utilities (`cursor-grab`, `cursor-not-allowed`, `cursor-text`) still win. A style lint fails on `cursor-default` or `cursor-auto` in the app without a written reason. Hand-added `cursor-pointer` classes that the rule now covers are removed.
- **No "Add a task" in list empty views.** The empty view of a list that shows its own quick add keeps its sentence, its illustration and its secondary link (Today's "Open Upcoming", "n waiting for other tasks", "Show n completed"), and loses the primary button. Views whose action goes somewhere else keep it: "Open Inbox" (Assigned, a read-only project, the Trash), "Open Today" (Completed). Buttons that add to a specific place stay: an empty board column, an empty day in the calendars and the Plan, the onboarding checklist.

No data, sync, API or op-log change. No new dependency, no new environment variable. Nothing **BREAKING**.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: "Inline title editing" (a click on a row's empty area opens the panel under every setting), "Empty views" (no primary button where the view shows its own quick add).
- `design-system`: a new requirement "Pointer on clickable elements".

## Out of scope

- The other points of the same feedback (Close the day, Workspaces settings, the filter builder, the page frame, the illustrations, the planned-without-project line): separate changes.
- Compact calendar rows (Day, Week, Plan), which already select on click and open on a second click or a double click.
- Touch-specific feedback (the cursor rule has no effect on touch).

## Roadmap

Advances the interface quality track of ROADMAP.md ("Next: Design refresh" follow-ups from the owner's feedback); it adds no new feature row.
