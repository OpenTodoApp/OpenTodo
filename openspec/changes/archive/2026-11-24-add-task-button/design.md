# Design

## Context

- `q` (`list.quick-add`, `useCommandBar`) focuses the list's quick add where there is one (`listState().focusQuickAdd`), else opens the command bar in Add mode. The list's line adds with `taskDefaults(route)`; the bar adds with the defaults of `defaultsRoute(route)` (a list screen's own, else the Inbox's). The phone's add button opens the sheet with the same `taskDefaults`.
- The line layout of `QuickAdd` has a calendar button (quick-add-calendar). The palette has field rows and the phone sheet a tool row (palette-quick-add D2, D7); both edit through the line with `edit(kind)`: select a set field's words, or start its token and open its suggestions.

## Goals / Non-Goals

**Goals:** a visible, quiet entry point on a computer that needs no key; setting priority, project and labels with the pointer in the list's quick add; one model (the parsed line) and one set of defaults.

**Non-Goals:** a modal composer, configurable defaults, the phone.

## Decisions

### D1. Add task is the sidebar's first item and runs `q`

The item sits under the workspace row and the space switch, above Inbox, in the Tasks space only, and only from 768 px (the phone keeps its add button, the drawer does not repeat it). It is a `SidebarItem` in the row's quiet tone with the phone add button's mark: a small accent circle with a plus (`on-accent` on `accent`, an existing pair), so it reads as the primary action without colouring the text. With shortcut hints on it prints `q` like the destinations print their `g` keys; its tooltip names the key in every case, and `aria-keyshortcuts="q"`. In the icon rail it is the mark alone with the name in the tooltip.

Clicking it calls the same `quickAdd` that `q` calls, so the behaviour, the context and the place of the new task can never differ between the two. The context is the view's, because it comes from where the task is added: the list's line (its placeholder already names it, "Add a task for today…", "Add a task to Work…") or the bar's view defaults. Nothing is prefilled as text, so a typed date or project still overrides the view's as today.

Considered: always opening the bar as a dialog, as Todoist does. Rejected: a list already has a visible, sticky quick add with its context, and `q` focuses it; a second place to type in the same list would be two composers.

### D2. Field buttons write the line

`LineTools` renders the calendar button (unchanged) and Priority, Project and Label buttons beside the field. Each calls `edit`, the palette's and the sheet's action: an unset field's token is started at the end of the line (`p`, `#`, `@`) and its suggestions open; a set priority's or project's words are selected. Label always starts a new `@` (`onEdit({ kind })`), because a task takes several labels. `startToken` reuses a bare token already ending the line, so `Buy primer #` never becomes `Buy primer # #`. A set field's button shows in the default tone. Buttons keep the focus in the field on a click (`mousedown` is prevented) and are in the tab order after the field, each named by its field. They are hidden while recognition is off (the tokens would stay text) and below 640 px, where the line is narrow and the phone has the sheet's tools.

`edit` now opens the suggestions for a started priority too (`p1`–`p4`, priority-names D4), in every layout, so the palette's Priority row and the sheet's flag behave like Project and Label.

### Data model

None: the buttons write the line, and the task is created by the existing `createTask` op path.

### Interface budget

No row of chrome is added above a list (the buttons sit inside the existing line, the item inside the sidebar's pinned top). Add task is an action, not a destination: the primary destinations stay as they are. No new shortcut; `q` is reused. No new dependency; the bundle grows by a few hundred bytes.
