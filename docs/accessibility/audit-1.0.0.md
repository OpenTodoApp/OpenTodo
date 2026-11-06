---
title: Accessibility audit for 1.0.0
summary: The manual accessibility passes on every core screen before OpenTodo 1.0.0, with who ran them, how, and the result of each, as the conformance statement summarises them.
audience: user
section: Reference
specs: [accessibility]
screens: []
order: 86
---
# Accessibility audit for 1.0.0

Date: 2026-11-03

The manual half of the [accessibility statement](../accessibility.md): one row per core screen of the screen inventory (`scripts/ux-audit/screens.json`, the screens used daily or weekly), one column per pass. Each result is `pass`, `fail #<issue>` (the issue is listed under the statement's known exceptions), `n/a` with a reason, or `pending` (not yet run). `make repo-check` fails on a missing core row, an empty or unknown result, or a failure that is not a listed exception; `make release-prepare` refuses 1.0.0 and later while any core result is `pending`, and any release more than 12 months after this date.

## How each pass was run

- **Keyboard only** (2026-11-03, run by Claude for the maintainer): no pointer. The accessibility gate's Tab walk on every screen and overlay at 360 and 1280 px (every stop reachable, its ring visible and not covered), and the main flows by keyboard at both widths with `scripts/ux-audit/keyboard-flows.mjs`: the skip link, quick add with <kbd>q</kbd>, the <kbd>g</kbd> keys, <kbd>j</kbd>/<kbd>k</kbd>, priority, opening and closing a task, the row menu, labels, completing and undoing, search with <kbd>Ctrl</kbd>+<kbd>K</kbd>, a setting toggled with <kbd>Space</kbd>, a dialog that keeps <kbd>Tab</kbd> inside, the calendar and the weekly review.
- **200% zoom, text size 20** (2026-11-03, run again on 2026-11-06 after the settings and Upcoming changes, by Claude): every core screen at 640 CSS px with a mouse (a 1280 px window at 200%) and the browser's text size at 20 px, through the accessibility gate (`A11Y_ONLY=1 WIDTHS=640 TOUCH_BELOW=0 TEXT_SIZE=20`), plus reflow at 320 px (400%).
- **NVDA + Firefox, VoiceOver + Safari (macOS), VoiceOver (iOS shell), TalkBack (Android shell)**: pending. These need the real screen readers on real devices; the steps are below. Until they are done the statement claims partial conformance, and 1.0.0 cannot be released.

## Steps for the screen-reader passes

For each core screen below, with the screen reader on and the screen opened from the sidebar (or its overlay from that screen):

1. The screen's name is read when it opens (the page title and its heading), and the heading list (NVDA <kbd>H</kbd>, VoiceOver rotor) has its title first.
2. Landmarks: navigation (the sidebar), main, and the page's own regions; the skip link reaches the content.
3. Every control is announced with a name, a role and its state (pressed, expanded, checked, selected), and the name contains the visible words.
4. Lists are announced as lists with their item count; a project's sections each as a named list ("Planning, list, 12 items"); a task row reads its title, then its date, labels and state.
5. Completing a task, Undo, a sync error, a saved setting and a reminder are announced without moving focus (live regions).
6. A dialog or sheet: focus moves in, its title is read, the page behind cannot be reached, and Escape (or the close button) returns focus to the control that opened it.
7. Menus and pickers: arrow keys move, the selected item is read, typing finds an entry, Escape closes.
8. In a 2,000-task project (the performance account, `make perf` or `go run ./cmd/perfseed`), browse the list to its end and back: every row is read, nothing is skipped or read twice.
9. On the phone shells: the same with swipe navigation, the rotor's headings and actions, and the native screens (connecting to a server, settings, the widgets).

Mark `pass`, or open an issue labelled `accessibility` and write `fail #<issue>`; a failure on a core screen is fixed before 1.0.0.

## Results

| Screen | Keyboard only | NVDA + Firefox | VoiceOver + Safari (macOS) | VoiceOver (iOS shell) | TalkBack (Android shell) | 200% zoom, text size 20 |
|---|---|---|---|---|---|---|
| `inbox` | pass | pending | pending | pending | pending | pass |
| `today` | pass | pending | pending | pending | pending | pass |
| `upcoming` | pass | pending | pending | pending | pending | pass |
| `project` | pass | pending | pending | pending | pending | pass |
| `board` | pass | pending | pending | pending | pending | pass |
| `task` | pass | pending | pending | pending | pending | pass |
| `task-panel` | pass | pending | pending | pending | pending | pass |
| `panel-comments` | pass | pending | pending | pending | pending | pass |
| `panel-activity` | pass | pending | pending | pending | pending | pass |
| `panel-history` | pass | pending | pending | pending | pending | pass |
| `panel-time` | pass | pending | pending | pending | pending | pass |
| `when-popover` | pass | pending | pending | pending | pending | pass |
| `label-picker` | pass | pending | pending | pending | pending | pass |
| `command-palette` | pass | pending | pending | pending | pending | pass |
| `sidebar` | pass | pending | pending | pending | pending | pass |
| `quick-add` | pass | pending | pending | pending | pending | pass |
| `add-menu` | pass | pending | pending | pending | pending | pass |
| `notifications` | pass | pending | pending | pending | pending | pass |
| `bulk-actions` | pass | pending | pending | pending | pending | pass |
| `undo-toast` | pass | pending | pending | pending | pending | pass |
| `triage` | pass | pending | pending | pending | pending | pass |
| `day` | pass | pending | pending | pending | pending | pass |
| `week` | pass | pending | pending | pending | pending | pass |
| `month` | pass | pending | pending | pending | pending | pass |
| `year` | pass | pending | pending | pending | pending | pass |
| `plan` | pass | pending | pending | pending | pending | pass |
| `timeline` | pass | pending | pending | pending | pending | pass |
| `columns` | pass | pending | pending | pending | pending | n/a the Columns layout is offered from 768 px, and this zoom gives the phone layout |
| `assigned` | pass | pending | pending | pending | pending | pass |
| `someday` | pass | pending | pending | pending | pending | pass |
| `anytime` | pass | pending | pending | pending | pending | pass |
| `next` | pass | pending | pending | pending | pending | pass |
| `waiting` | pass | pending | pending | pending | pending | pass |
| `loop` | pass | pending | pending | pending | pending | pass |
| `focus` | pass | pending | pending | pending | pending | pass |
| `review` | pass | pending | pending | pending | pending | pass |
| `stats` | pass | pending | pending | pending | pending | pass |
| `completed` | pass | pending | pending | pending | pending | pass |
| `notes` | pass | pending | pending | pending | pending | pass |
| `trash` | pass | pending | pending | pending | pending | pass |
| `feed` | pass | pending | pending | pending | pending | pass |
| `ask` | pass | pending | pending | pending | pending | pass |
| `filter` | pass | pending | pending | pending | pending | pass |
| `views` | pass | pending | pending | pending | pending | pass |
| `view` | pass | pending | pending | pending | pending | pass |
| `dashboard` | pass | pending | pending | pending | pending | pass |
| `labels` | pass | pending | pending | pending | pending | pass |
| `label` | pass | pending | pending | pending | pending | pass |
| `projects` | pass | pending | pending | pending | pending | pass |
| `settings` | pass | pending | pending | pending | pending | pass |
| `settings-account` | pass | pending | pending | pending | pending | pass |
| `settings-appearance` | pass | pending | pending | pending | pending | pass |
| `share` | pass | pending | pending | pending | pending | pass |
| `project-menu` | pass | pending | pending | pending | pending | pass |
| `section-menu` | pass | pending | pending | pending | pending | pass |
| `assistant` | pass | pending | pending | pending | pending | pass |
| `help-panel` | pass | pending | pending | pending | pending | pass |
| `label-menu` | pass | pending | pending | pending | pending | pass |
| `view-menu` | pass | pending | pending | pending | pending | pass |
