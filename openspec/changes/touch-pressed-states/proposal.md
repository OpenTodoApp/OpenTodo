# Proposal

## Why

GitHub issue [#1349](https://github.com/OpenTodoApp/OpenTodo/issues/1349). `shell-touch` turned the browser's tap flash off and gave every control without a pressed state one generic answer: it dims to 60% while a finger is on it. That is feedback, not design. The controls a phone uses most have nothing of their own: the tab bar's tabs, the add button, a task row and its checkbox, chevrons and grip, the drawer's rows and menu items. A dimmed accent button and a dimmed title read as "disabled" for a moment, where the rest of the app (`.ui-btn`) shows the selected surface.

The same survey measured the tab bar's tabs at 44 px on a touch screen. The component asks for 56 px and the shell reserves 56 px for the bar; the spec says at least 48 px.

## What Changes

- On a touch screen these controls show the app's pressed colour while a finger is on them and return at release: a tab, a drawer row, a menu item and a row's checkbox, Show details, subtask chevron and grip take the selected surface; a destructive menu item takes the soft danger colour; the add button takes the darker accent it already has for hover.
- A task row takes the selected-row surface while a finger is on its body (the part that opens the task), and the title no longer dims. Pressing a control inside the row tints the control, not the row.
- A designed pressed state replaces the generic dim; the two never stack. The dim stays as the fallback for every other control.
- The pressed colour comes at once, without a transition.
- The tab bar's tabs are 56 px tall on a touch screen, as they already were with a mouse in a narrow window. The layout check fails on a tab under 48 px.

Nothing changes with a mouse or trackpad.

Out of scope: pressed states for controls not named above (chips, options of a combobox, the note outline's items, the calendar's compact rows keep the dim), any change to hover or focus states, haptics, the minimised tab bar's height (44 px on touch, the smallest touch target), the bar's overflow and titles (`phone-bar-overflow`, `phone-titles-everywhere`).

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a new requirement, "Designed pressed states on touch".
- `app-shell`: a new requirement, "Tab height on a touch screen".

## Impact

- `web/src/index.css`: the utilities `press-*` and `press-inset`, the row's pressed rule.
- `web/src/app/TabBar.tsx`, `web/src/app/phoneFrame.tsx`, `web/src/app/TaskRow.tsx`, `web/src/ui/Menu.tsx`, `web/src/ui/patterns/Sidebar.tsx`: class names only.
- `scripts/ux-audit/measure.mjs` (`touchFeel`): the tab height check, used by the layout check.
- Tests beside each; `docs/design-system.md`, `docs/interface-guide.md`.
- No string, no op field, no server change, no dependency.
- Visual baselines: every phone-width screen with the tab bar (the bar is 12 px taller on touch emulation).
