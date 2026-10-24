# Design

## Context

`briefing` added `lib/briefing.ts` (pure facts) and `app/Briefing.tsx` (wording). The facts already carry the named task's id; a count of late tasks carries only the number. Today's list exposes its state to the rest of the app through `registerListState` (`listActions.ts`), including `tick(ids)` for bulk selection. Upcoming groups its rows by date, each group a `[data-group="<date>"]` section. The notification bell lives in the sidebar footer, which is always mounted (a drawer below 768 px, a rail when collapsed). `projects-table` hides the health detail below a 36 rem container width with a container query.

## Goals / Non-Goals

Goals: every part of the briefing leads to what it names; the briefing can be hidden on every device at once; the health word is never an unexplained judgement.

Non-goals: new facts, per-fact settings, a page of late tasks.

## Decisions

### D1. Late facts carry their ids

`BriefingFact` `late` gains `ids: string[]`, the late tasks in Today's order. The single-task form keeps `task` for its title. The fixtures add `ids` to every late fact. Nothing else in the facts changes, so the sentence reads the same.

### D2. Where each part leads

| Part | Action |
|---|---|
| a named task | `openTaskPage(id)` from the current page, so Esc returns there |
| "n tasks are late" | on Today: `listState().tick(ids)`, select the first and scroll it into view; elsewhere navigate to Today first and do the same once its rows are listed |
| a full day | navigate to Upcoming and scroll `[data-group="<date>"]` into view once it renders |
| replies without one named task | `notificationsOpen.request('open')`: the shell opens the phone drawer, the bell opens its popover |

Ticking rather than a passing highlight: the reader wants "those exact two tasks", and ticked rows stay marked and come with the selection bar (Reschedule, Move, Complete), which is what one does with late tasks. The wait for rows after a navigation is a short `requestAnimationFrame` loop that gives up after two seconds, the same tolerance as other cross-page requests; nothing is written.

### D3. Quiet links

Each link is a `<button>` inside the sentence (it acts on the page, it does not change the address except through `navigate`), styled as text: same colour and weight, `underline` on hover and `focus-visible`, the focus ring of the design system. Its accessible name is the clause plus where it goes ("Renew the passport, open task"; "2 tasks are late, select them in Today"; "Monday, open in Upcoming"; "3 replies are waiting, open notifications"), from the catalogs.

### D4. The hide preference

A new `user_prefs.briefing` string: `"hidden"` hides the briefing, anything else (empty, unknown) shows it, like `start_checklist`. It is an ordinary op, so it works offline and converges by last-writer-wins per field. The toggle is an item in the day page's overflow menu on Today and Upcoming (desktop header and phone bar alike), so it adds no chrome. The Daily check ignores it: that page exists to brief.

### D5. Health reason on narrow tables

A `ResizeObserver` on the table's container (the same 36 rem threshold as the container query) tells `HealthCell` whether the detail is shown. When it is hidden and the project has a detail, the word becomes a text-styled `<button>` wrapped in `Tooltip` (label: the detail), so hover and keyboard focus show it; a tap (touch never opens the tooltip) toggles the detail in place under the word, `aria-expanded` on the button. The row's click handler already ignores buttons, so the tap does not open the project. The detail text is in the DOM at every width, visually hidden when narrow, so screen readers always read it.

## Data model impact

One additive field, `user_prefs.briefing` (string), in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, `USER_PREFS_DEFAULTS` and `internal/sync/testdata/schema_fixture.json`. Not content, so not in the end-to-end encryption fields. An older server refuses the field as unknown and the device keeps it, as with earlier preference fields.

## Interface budget

No new chrome: the toggle is a menu item, the links are the sentence itself, the reason is in the existing cell. No new shortcut. Hiding the briefing removes a row above the list.

## Size and memory

No dependency. A few hundred bytes of code and about ten messages per catalog. No server memory change.

## Risks / Trade-offs

- Ticking may surprise someone who wanted only to look; Esc or a click on empty space clears it, as always.
- The wait-for-rows loop could miss on a very slow device; then the page opens without the selection, which is harmless.
