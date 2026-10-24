# Design

## Context

Precision's tokens (`precision-tokens`) added the selected, selected-row and hover surfaces; the screens Precision redrew use them. The screens it did not draw were converted by token only, so their class names still ask for `bg-accent-soft` where Precision means "selected". The audit tour (`make ux-audit`, 40 inventory entries at 360 and 1280 px, light and dark) and a larger-text pass (Chromium's default font size set to 20 and 24 px through the DevTools protocol, the same effect as the browser's text size setting) found the faults listed in the proposal.

## Decisions

### D1. Grey for a cursor, accent for a choice

A row or item the user is on (the keyboard cursor, the selected row, the current item of a short list) uses `bg-selected-row` (rows) or `bg-selected` with `text-strong` (navigation-like lists). Precision reserves the accent for state; a cursor is position, not state. Bordered choice cards (a token's scope, a channel kind, a method mode) keep `border-accent bg-accent-soft`: they show a value the user picked, like a checked radio. Ticked rows in bulk selection keep the accent tint for the same reason, and the linked comment highlight stays.

### D2. The selection bar is grey

"3 selected · Actions · Clear" sits on `bg-selected` without a border. The count is strong text. It no longer competes with the page's primary button.

### D3. Breakpoints in rem

Tailwind 4's breakpoints are rem media queries, which follow the browser's default font size. Scripts used pixel queries, so the two disagreed when the text size is not 16 px. Every script query becomes the rem value of its pixels (640 → 40rem, 768 → 48rem, 1024 → 64rem; `max-width: 767px` → `max-width: 47.99rem`). Tests stub `matchMedia` through one helper, `minWidthPx`, that reads px or rem.

### D4. Notes beside bars avoid the today line and the axis end

The note's width is estimated from its text at the 12.5 px meta size (6.5 px per character plus 4). It starts 8 px after the bar. If that span would cover the today line (±4 px), it starts 8 px past the line instead; the gap to the line is the lateness the note states. If it would run past the axis end, it ends 8 px before the bar. The rule is a pure function, `notePlacement`, tested on its own.

### D5. Week agenda's empty days

The week agenda used the empty-view component (heading, primary button) once per empty day. Plan already uses one quiet line per day. The agenda now does the same; the Day view and the month's day list keep the empty view, because each shows a single day.

### D6. Programmatic focus without a ring

The weekly review moves focus to the step title so a screen reader announces each step. The title has `tabIndex={-1}`, so it is never reached with Tab; WCAG 2.4.7 asks for a visible indicator on keyboard-operable elements, which it is not. The ring is removed; the title keeps `outline-none`.

### D7. Narrow table and header

The health column of All projects is hidden below an 18 rem container (328 px at 18 px or more of text; a 360 px phone at the default size is 20.5 rem and keeps it), and the health is rendered under the name instead, with the same tooltip and tap-to-explain behaviour (`briefing-links`). Process hides its word and key below a 21 rem viewport (336 px at 16 px; a 360 px phone at the default size keeps the word); its accessible name stays "Process".

### D8. Bulk label pick reads the store

The picker's checked state comes from a live query that may not have loaded (or may still hold an earlier selection) on a quick pick. The pick handler now reads the ticked tasks itself and decides add or remove from that read; the batch still re-reads each task inside the write, as before.

## Interface budget

No chrome is added. The week agenda loses seven buttons for an empty week. Nothing changes in the sidebar, shortcuts or task properties; no new scroll region.

## Data model

None.

## Size

No dependency. A few hundred bytes of script.

## Risks

- Tests that stub `matchMedia` with a pixel regex would silently treat rem queries as "no min-width": all are moved to the helper, and a grep in the review finds none left.
- A screen I did not tour could still use an accent tint for a cursor; `make ux-audit` remains the check.

### D9. "Overdue" is a label, not a value

The health value `slipping` is computed on every device from shared rules (`projectHealth.ts`, its tests and the sort rank); it is never synced or stored. Only the English label and its five translations change: "Overdue" (de "Aufgaben überfällig", fr "Tâches en retard", es "Tareas vencidas", it "Attività scadute", pt "Tarefas atrasadas"). The translations name the tasks, because "Late" already uses the bare word ("Überfällig", "En retard", …) for a passed deadline. The statistics panel "What keeps slipping?" is a different measure (due dates moved later) and keeps its name.

The app has a rule never to call the user's tasks "overdue" (`page-rhythm` D8, "Words for tasks that are late"): groups say "Earlier". The health word names a project's state, not a group of tasks, so this change makes it the one written exception, and the wording test allows exactly that message. If the exception is not wanted, the alternative inside the rule is a phrase built on "earlier" (for example "Tasks from earlier"), which is longer than one word.
