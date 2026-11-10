# Design

## Context

The Calendar destination is a `Route['view']` union (`web/src/app/router.ts`) with five modes. Each mode is a lazy React view that calls `rememberCalendarMode(mode)` and renders `CalendarRangeSwitch`; `readCalendarMode()` decides what `/calendar` opens on this device. `useCalendarGo()` (`web/src/app/calendar/scope.tsx`) maps the switch's `CalendarRangeMode` straight to `navigate({ view: mode, date })`, so a new mode needs a route, a screen entry, a lazily loaded component and its share of the shortcut registry.

Year mode (`web/src/app/YearView.tsx`) already draws compact month grids with a per-day density mark computed by `yearCounts()` over an arbitrary `[from, to]` interval (`web/src/lib/yearView.ts`), and has a keyboard grid, a hover/focus tooltip and a phone fallback (a whole month is one tap target). Plan mode (`web/src/app/PlanView.tsx`) reads `GridPrefs.planDays` from the `calendar.grid` meta row, normalised by `normalizeGridPrefs()`, and renders `PLAN_SPANS.map()` into the page header's overflow menu.

## Decisions

**D1. Calendar quarters, not rolling 90 days.** The quarter is the calendar quarter of the anchor's month: Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec. `quarterOf(date)` returns the first month, the three month keys, `[from, to]`, `n` and `year`; the view builds the title from the already-translated `Q{n} {year}` message (`T4` in French, Spanish, Italian and Portuguese). This matches the quarter that objectives and review intervals already use, and makes `[` / `]` and the month-name links unambiguous. A rolling quarter was rejected: it would show the same months in a different order on every day and could not be named.

**D2. Reuse Year's density cell, extracted once.** `YearView.tsx`'s local `MonthCells` (and its step constants and `tipText`) move to `web/src/app/calendar/MonthDensityCells.tsx`, exported and used by both Year and Quarter. Quarter calls `yearCounts()` with the quarter's `from`/`to` and `useCalendarFeeds(from, to)` for the same range, then draws exactly three months in the Year grid's responsive columns. No new density algorithm, no new cell component, no new tooltip logic. A Month-style grid with task rows was rejected: three months of task rows would repeat Month's `Months shown: 3` choice and be unreadable at a quarter's scale.

**D3. One route, one mode, one set of keys.** `/quarter[/YYYY-MM-DD]` joins the existing calendar route group in `parseRoute`/`routePath`; `VIEW_QUICK_ADD` and `ROUTE_SCREENS` gain `quarter`. `CalendarRangeMode` and `CalendarMode` gain `'quarter'`, the switch array inserts it between Month and Plan, `Shell.tsx` and `ProjectCalendar.tsx` lazily render it, and `panel.ts`, `ShortcutHelp.tsx` and `Sidebar.tsx` include it in their calendar-page checks. `g q` is free in the `g` chord table and does not collide with `q` (quick add is a `view`-scope key, not a `g` chord); `SHORTCUTS` gains `quarter.*` entries modelled on `year.*` with `[` / `]` stepping three months, and `VIEW_SCOPES.quarter = []` like the other grid views. `make docs` regenerates `docs/keyboard.md` from the registry.

**D4. Widen the span, keep the normaliser as the one gate.** `PlanSpan` becomes `number`; `PLAN_SPANS` is the preset list `[3, 7, 14, 21]`. `GridPrefs.planDays` becomes a number in `[2, 90]`. `normalizeGridPrefs()` accepts any integer in that range (so 7/14/21 rows from older releases still work) and falls back to 14 for a missing, non-integer, out-of-range or string value. 90 is the ceiling because a quarter is the longest horizon the Calendar now offers and because each day is a column with projections, events and slots: beyond that the grid stops being an overview and starts being a performance cost. Everything downstream (`spanDates`, `followAnchor`, the title, the phone agenda) already takes a number and needs no change.

**D5. Custom span is a dialog in the same menu.** The overflow menu gains `3 days` as a fourth preset and `Custom…` as a fifth item. `Custom…` is checked when the current span is not one of the presets and shows the current length as its description. Choosing it opens a small `Dialog` with a single numeric field (`Number of days`, `2–90`), Save and Cancel; an invalid or out-of-range value is refused with a message and does not change the preference. Save goes through the same `act(saveGridPrefs({ ...prefs, planDays: n }))` path as a preset, so the write is one local meta-row edit with the same offline behaviour. Neither the mode nor the span is written to the op log.

**D6. Keyboard and interface budget.** Quarter keeps the Year keyboard grid (arrows, Page Up/Down, Home/End, Enter, `[`, `]`, `t`, Escape) with roving tabindex and accessible day names; all of it is reachable without a pointer. The range switch stays one row of chrome (one more button, no second row), no new sidebar destination, no new task property and no new scroll region. The custom-span dialog is a single field with a labelled range. Every new shortcut is registered in `SHORTCUTS` and `shortcuts.test.ts`'s conflict check must pass.

## Data model

| Where | Field | Change | Synced |
| --- | --- | --- | --- |
| `calendar.grid` meta row | `planDays` | accepted range widens from `{7,14,21}` to integer `[1,90]`, default still 14 | no (device-local) |
| `ot.calendar.mode` device storage | — | accepted enum gains `'quarter'` | no (device-local) |

No op-schema field is added, renamed or removed; `internal/sync/ops.go`, `web/src/generated/opSchema.ts`, `CONTENT_FIELDS` and the contract fixture are untouched. A device opening this release after an older one reads its old `planDays` unchanged; an older device reading a `planDays` outside `{7,14,21}` falls back to 14 without corrupting the row. Offline: both choices are read from and written to local storage and take effect at once, with nothing to converge.

## Size

No dependency, no Go change, no container image or runtime memory change. `QuarterView`, the shared `MonthDensityCells` chunk and `lib/quarter.ts` load only with the lazy Year, Quarter and Plan views. The first load gains the `quarter` route literal, `VIEW_QUICK_ADD`, `ROUTE_SCREENS`, the range-switch label, the shortcut registry's `go.quarter` and eight `quarter.*` rows with their cheat-sheet copy and section title, the palette command, and the small calendar-page checks in `panel.ts`, `ShortcutHelp.tsx` and `Sidebar.tsx`. These are the shell's own route and shortcut tables, so none of them can wait for a lazy chunk.

Measured in CI on the merged branch: entry **143.4 KB gzip**, first load **687.5 KB gzip**. Quarter's shortcut rows sit in the entry chunk, so `web/bundle-budget.json`'s entry budget is raised on purpose to **145 KB** while the first-load budget stays at **697 KB** (upstream's own successive merges raised it from 686 to 697, each reason recorded in `$comment`). `scripts/bundle-budget.mjs` asks for the reason in the pull request too. Re-measure with `make bundle-budget` after each merge; `make bundle-budget` and `make openspec-validate` remain the gates.

## Risks

- `screens.test.ts` parses the `Route` union out of `router.ts` and fails on a missing `ROUTE_SCREENS` entry; the change adds it in the same step.
- `shortcuts.test.ts` fails on a `views: ['quarter']` entry without `VIEW_SCOPES.quarter` and on any chord collision; both are covered by tasks.
- `i18n-check` fails when a new `msg()`/`t()` call is not in `messages.json` or a translation is missing; `Quarter`, `Q{n} {year}`, `Custom…`, `Number of days`, `Save`, `Cancel` and `Next quarter` already exist and are translated; `Previous quarter` and `Plan length` were added to all six catalogs.
- `docs-check` fails on a stale generated `docs/keyboard.md` or a doc that names a screen id that is not declared; Quarter reuses the existing `calendar` screen id.
