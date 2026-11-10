# Proposal

## Why

Adding a task is the most frequent action in the app, but the inline "Add a task" field on Today, Inbox, label and project views barely reads as a field. Its input is transparent on the page surface, so the only cues are a small `+` and the placeholder; in dark mode, where the surface, raised and sunken tokens sit within about 0.04 lightness of each other, it looks like a text link under a faint divider. A first-time user has to guess that it is interactive.

## What Changes

- Every `line` presentation of the quick add (the list pages' sticky row, the Inbox catch on the method home and in review, the first-run screen, the capture screen, the add-on-day dialog, the section add) draws its field on a filled surface: the sunken token, the control radius, compact padding, and the focus border with its ring when the input has focus.
- The list pages' quick add row drops the hairline under it; the filled field replaces it. The row keeps its sticky behaviour and opaque page surface.
- The read-only quick add of a viewer's shared project uses the same shape, dimmed.
- The chips row under the field keeps lining up with the text after the `+`.
- In the high-contrast presentation, where the surface tokens are identical, the field carries a border instead of a fill difference.

Out of scope: the command bar (`palette`) and phone sheet (`sheet`) presentations, which already sit inside their own frames; parsing, chips, token suggestions, dictation, paste-to-tasks and every shortcut (`q`, Shift+V); where the field is placed; any data, op or API change.

Advances: no ROADMAP.md item; a polish change to `design-system` ("Three surfaces", "Form controls").

Nothing here is **BREAKING**: no environment variable, no op field.

## Impact

- `web/src/app/QuickAdd.tsx`, `web/src/app/TaskListView.tsx`, `web/src/app/task-list/ListChrome.tsx`, `web/src/index.css` (one component class), and the quick add stories.
- Visual baselines of the quick add and list stories are regenerated.
- No new dependency; the bundle grows by a few CSS rules.
