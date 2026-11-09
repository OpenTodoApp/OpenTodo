# Proposal

## Why

GitHub issue #778 (suggested in #755): some people work from paper, a printed list on the desk for the day or a project to review. OpenTodo has no print support: printing a page from the browser prints the sidebar, the header's controls and the quick add, cuts the list to what fits on screen, and in a dark or custom theme prints light text on a dark fill or nothing at all.

## What Changes

- A print stylesheet: the browser's Print (Ctrl+P or Cmd+P) on a list view (the Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Completed, a project, a label, a location, a saved view) prints the page's title and its list as on screen: its groups (sections, Earlier and Today, dates …), its subtasks indented, each row with its time, title, date, project, labels, priority mark and counts, and its checkbox as an empty circle to tick by hand. Collapsed groups and parents stay collapsed.
- Nothing else is printed: no sidebar, bar, tab bar, quick add, page or row actions, drag handles, toasts, assistant, panel or open overlay.
- Black text on white in every theme (light, dark, high contrast, a custom theme), with no fills, tints or shadows; the priority colours of the checkbox and the mark stay.
- Every row is printed, over as many pages as it takes; a row is never split across two pages and a group's header stays with its first row. A long title is printed whole.
- **Print…** at the end of the list's menu (the "…" of the page header, the project menu in the list layout, the label menu, a saved view's menu in the list layout) opens the same print, also in the installed app, which has no browser menu. The Android and iOS apps leave it out: their web views do not print.

Out of scope: a print dialog with its own project choice, sort or filter; printing a whole workspace at once; PDF or Markdown export (the browser's "Save as PDF" covers the PDF); printing the board, timeline and calendar layouts, Plan, the calendar views and dashboards; new settings; printing from the Android and iOS apps (it needs a print bridge in each shell). No ROADMAP item; it answers issue #778 with its minimal scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: adds "Printing a list".

## Impact

- Web app only: the print rules in `web/src/index.css` (the phone row's rules now apply to screens only, so a page narrower than 768 px keeps the property column), `web/src/app/menus/printItem.tsx` (the item and `printList`), the menus in `TaskListView.tsx`, `SampleNotice.tsx` (the Inbox menu is now always there, for Print…), `ProjectHeader.tsx`, `LabelsView.tsx`, `ViewsView.tsx` and `SavedViewView.tsx`, and the interface icon `printer` (`web/src/ui/icons/names.json`).
- One new message, "Print…", in every catalog.
- No op field, sync, API, CLI, MCP, encryption, dependency or server change; nothing to migrate. First-load JS and CSS grow by about 0.3 KB gzip (692.3 to 692.6 KB, within the 693 KB budget).
- Docs: a new guide page, `docs/print-a-list.md` (`docs/import-export.md` is at its word limit).
