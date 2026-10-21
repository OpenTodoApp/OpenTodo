# Design

## Context

See proposal.md for the motivation. What exists and shapes the approach:

- **Blocks are outlines today.** `web/src/app/calendar/DayColumn.tsx` draws a task block as `bg-surface` with `border-hue-solid` on all sides, a 3 px left border and `shadow-1`; unestimated blocks use `border-dashed`; the day lane rows and the Month and Plan rows (`MonthView.tsx`, `calendar/PlanRow.tsx`, `calendar/WeekAgenda.tsx`) are `bg-sunken` with `border-l-3 border-l-hue-solid`. Event blocks (`CalendarEvents.tsx`) are already `bg-hue-soft` with a hue border, so today an event looks more like the proposed task block than a task does. A now line exists (`data-now-line`, danger tone) in `DayColumn.tsx`. Timeline bars (`TimelineView.tsx`) are `bg-accent-soft` with an accent border, or the danger pair when late, and do not use the project hue.
- **Hue tokens.** `data-hue="<name>"` resolves `--hue-solid`, `--hue-soft`, `--hue-text` from twelve palette hues in `web/src/index.css`; `src/ui/tokens/pairs.ts` already checks `hue-<h>-text` on `hue-<h>-soft` at 4.5:1 and `hue-<h>-solid` on `surface` at 3:1. Strong text on `hue-soft` is not yet a checked pair.
- **Board columns** (`BoardView.tsx`) are `rounded-card bg-canvas p-1.5` with a dark border and a `ring-2 ring-accent` on `data-drop-active`; the drag primitive (`web/src/lib/dnd.ts`, `useBoardDrop.ts`) marks the target with `data-drop-active` and has no placeholder. Cards are the card surface.
- **Settings cards** are one component, `web/src/ui/patterns/SettingsSection.tsx`: `rounded-card border border-default bg-surface p-4 shadow-1`. `settingsAnatomy.test.tsx` checks heading, line, rows and the Learn more link; `settings-copy` (open) modifies "Panel cards and rows" with the 90-character line and Learn more.
- **Statistics tiles and panels** are in `web/src/app/review/StatsView.tsx` and `charts.tsx` from `stats-dashboard` (open), which also rewrote "Statistics screen".
- **"Three surfaces"** in the design-system spec names row, card and overlay and makes the token lint (`src/ui/tokens/lint.test.ts`) fail on raw radius and shadow utilities in screens. The component classes live in `@layer components` of `index.css`.
- **Open changes that touch the same files.** `planner-view` owns `PlanView.tsx` and `PlanRow.tsx`; `rule-boards` owns the rule mark and the held-card state in `BoardView.tsx`; `icons-and-section-style` adds the icon and dot to column headers; `settings-copy` the Learn more link; `stats-dashboard` the tiles; `time-tracking` the Time tab (untouched). All are being archived within the hour; this change modifies none of the requirements they modify (checked by name across `openspec/changes/*/specs`), except that `ux-audit-three-widths` modifies "Core screens in the workbench", so the new stories are an ADDED requirement ("Surface stories in the workbench") and a task adds them to that list after both archive (D10).
- **`tokens-v2`** (parallel author) is expected to turn dark borders translucent and may move the hue table to OKLCH. This change uses the tokens by name only and inherits whatever values they end up with.

## Goals / Non-Goals

**Goals:**
- Structure that is felt: fills for things you can act on, sunken containers for groups, flat sections for the secondary, outlines only for "not yet" (unestimated, projected, free).
- Task and event always distinguishable without colour.
- Two new named surface styles so the token lint keeps protecting screens.
- Zero data or behaviour change: every drag, key and write path is untouched.

**Non-Goals:**
- No change to row anatomy in lists (`rows-v2`), to token values (`tokens-v2`), to the panel or dialogs.
- No new chart, tile, card or row anywhere.
- No per-user switch for the old look: the Calm/Detailed row preference is about rows, not surfaces.

## Decisions

### D1. Fill, edge, text: one recipe for every task block

A task block, a month or plan row and a timeline bar share one component class, `ui-block`, which reads `data-hue` and sets `background: var(--hue-soft)`, `border-inline-start: 3px solid var(--hue-solid)`, `color: var(--ot-text-strong)`, the control radius for blocks and the chip radius for rows (a modifier). Modifiers: `ui-block--dashed` (unestimated, keeps `border-style: dashed` on the edge only), `ui-block--past` (D3), `ui-block--late` (timeline: edge and text from the danger pair, overriding the hue). `DayColumn.tsx`, `MonthView.tsx`, `PlanRow.tsx`, `WeekAgenda.tsx` and `TimelineView.tsx` swap their class strings for it.

- *Alternative: keep per-view Tailwind strings.* Rejected: five files already disagree (surface vs sunken fill, shadow or not), which is how the wireframe look arose; one class is also the only way the token lint can tell a block from a hand-made box.
- *Alternative: solid hue fill with white text, as Google Calendar.* Rejected: twelve saturated fills on a week is the noise the analysis names; the soft step keeps the calm principle and the text pair already passes AA.

### D2. Events are neutral, with the colour as a dot

`CalendarEvents.tsx` moves from `bg-hue-soft` to a new class `ui-block--event`: `bg-sunken` fill, a hatched 3 px leading edge drawn with `repeating-linear-gradient` of `--ot-border-input` at 45° (3:1 against the sunken fill in both themes, checked by a new pair `border-input` on `sunken`), muted text, and a 6 px dot in `--hue-solid` before the summary. Free events keep `border-dashed border-hue-solid bg-transparent`. The Plan's event rows use the same class.

- *Alternative: keep events in the calendar's hue fill and move tasks to a stronger style.* Rejected: tasks are what the user acts on and deserve the fill; events must remain readable but recede, and the dot keeps the calendar identity for a multi-calendar user.
- *Alternative: an icon instead of the hatch.* Rejected: a 20 px block has no room for an icon; the hatch costs nothing in width and is a texture, not a glyph, so the "no glyphs as icons" rule is not touched.

### D3. Past is dimmed by mixing, not opacity

`ui-block--past` sets `color: var(--ot-faint)` and `background: color-mix(in srgb, var(--hue-soft) 55%, var(--ot-surface))`, and the edge to `color-mix(in srgb, var(--hue-solid) 60%, var(--ot-surface))`. The views apply it when the block's day is before the logical today (`useToday`), and the timeline applies it to the part of a bar before today by drawing the bar as two segments. `color-mix` over tokens is allowed by the lint. Opacity was rejected because it also fades the selection ring and the drag affordance and breaks the contrast test's assumptions; the pairs test gains a "faint on dimmed soft" entry per hue (4.5:1).

### D4. The now line stays as it is; the all-day strip gets a cap

`DayColumn.tsx` already draws the now line on today; the requirement text only pins it. The all-day strip gains a per-day cap of three with a "+N" `Button variant="ghost" size="sm"` that toggles `expanded` in a `Set<string>` kept in `localStorage` under `calendar.allDayExpanded` (device state, never synced), cleared when the set grows past 60 days. Three was chosen because at 1280 px a seven-column Week gives each day about 150 px and three chips is where the strip starts pushing the 07:00 row below the fold.

### D5. Capacity line: muted, tabular, interface face

The capacity line in `DayColumn.tsx` uses `font-mono` today, which the interface guide forbids for counts. It becomes `text-meta text-muted tabular-nums`, and the over state `text-danger font-semibold` on `bg-danger-soft`, the same classes the Month cell and Plan header already use, through one small shared component `CapacityLine` in `web/src/app/calendar/CapacityLine.tsx` used by all four views.

### D6. Column surface as a named style

A new component class `ui-column`: `background: var(--ot-sunken); border-radius: var(--radius-card); padding: 6px` and in dark `border: 1px solid var(--ot-border)`. `BoardView.tsx` replaces `rounded-card bg-canvas p-1.5 dark:border dark:border-default dark:bg-sunken` with it; the "Three surfaces" requirement lists it so `lint.test.ts` can allow `ui-column` and keep refusing raw `rounded-card` in screens. The header moves inside the surface (it is already a child of the column element; the change is padding and the muted count). Dashboards (boards of filters) use the same column element, so the rule mark from `rule-boards` lands in the same header with `text-muted`.

### D7. Drop placeholder from the drag's measured height

`useBoardDrop.ts` learns the dragged card's `offsetHeight` at `beginDrag` and exposes `{ targetKey, height }`; `BoardView.tsx` renders, in the active target column after its last card, a `div` with `ui-drop-placeholder` (`border: 2px dashed var(--ot-border-input); border-radius: var(--radius-control); background: var(--ot-accent-soft)`, 3:1 against the sunken fill through the `border-input` on `sunken` pair of D2) of that height, and marks the origin card `opacity-40` while `dragging` as the calendar already does. The `ring-2 ring-accent` on the column is dropped: the placeholder says where, the ring said only that. Keyboard moves (Shift+arrows) are instant and show no placeholder.

- *Alternative: a placeholder at the pointer's position between cards.* Rejected: a move always places the task last in the target column ("Move tasks between sections"), so a mid-column placeholder would promise an order the drop does not deliver.

### D8. Card lift

Cards gain `hover:shadow-2 focus-within:shadow-2 transition-shadow duration-(--duration-ui)` through the card surface class (`ui-card--lift` modifier used by `BoardView.tsx` only), so lists and settings cards do not start lifting. Under reduced motion the transition is instant, as the global rule already makes it.

### D9. Settings tiers through one prop and one test

`SettingsSection` gains `tier?: 'primary' | 'flat'` (default `flat`). Primary keeps today's classes; flat renders `ui-section-flat`: no border, no shadow, no fill, `padding-block: 20px`, `border-top: 1px solid var(--ot-border)` on every flat section after the first element of the page. The panels pass `tier="primary"` on the one card the "Card tiers" requirement names per page; `settingsAnatomy.test.tsx` gains two assertions: anatomy identical in both tiers, and at most one `data-tier="primary"` per rendered page.

- *Alternative: derive the primary card as "the first card with state".* Rejected: the state-first summary is a runtime fact (offline, demo) and the tier must not change when the network drops; naming it per page is a table of eleven entries.
- *Alternative: flat sections with no hairline.* Rejected after reading the Settings screenshot: nine flat sections with only white space between them lose their boundaries at 1280 px; the hairline is the cheapest boundary and matches the dashboard panels.

### D10. Spec placement against the open changes

"Core screens in the workbench" is modified by `ux-audit-three-widths`, so the new stories are "Surface stories in the workbench" (ADDED, design-system) and task 7.3 folds them into the core-screens list once both are archived. "Statistics screen", "Headline tiles" and "Dashboard panels" belong to `stats-dashboard`, so the tile presentation is ADDED. "Panel cards and rows" belongs to `settings-copy`, so the tiers are ADDED. The time-blocking, calendar-feeds, month-view, project-timeline and sections-and-boards requirements this change modifies are touched by no open change.

### D11. Interface budget and quality bar

No new row of chrome: the "+N" control lives inside the all-day strip, which is part of the grid's header row; the capacity line replaces its own text. No new visible task property, sidebar entry or scroll region; no new shortcut (the all-day toggle is a button in tab order). Every new class is a token composition, so the lint, the contrast pairs and the two dark blocks test stay the gates. Stories listed in "Surface stories in the workbench" are the acceptance surface; baselines come from CI's ui-check artifact because `make ui-baselines` needs Docker.

### Surface table

| Element | Light | Dark | Contrast pair |
| --- | --- | --- | --- |
| Task block, row, bar | `hue-soft` fill, 3 px `hue-solid` edge, `text-strong` | same tokens, dark values | strong on hue-soft ≥ 4.5; hue-solid on canvas and surface ≥ 3 |
| Past block | fill mixed 55 % to surface, edge 60 %, `text-faint` | same | faint on dimmed soft ≥ 4.5 |
| Unestimated block | as task, dashed edge | same | as task |
| Event block | `sunken` fill, hatched `border-input` edge, `text-muted`, `hue-solid` dot | same | border-input on sunken ≥ 3; muted on sunken ≥ 4.5 (exists) |
| Free event | transparent, dashed `hue-solid` outline, `text-hue` | same | hue-solid on surface ≥ 3 (exists) |
| Projected row | unchanged (dashed `border-default`, `text-faint`) | unchanged | unchanged |
| Now line | `danger` 2 px (exists) | same | n/a, decorative with the time in the header |
| Board column | `sunken`, card radius, no border | `sunken`, border `default` | n/a |
| Drop placeholder | 2 px dashed `border-input`, `accent-soft` fill | same | border-input on sunken ≥ 3 |
| Card at rest / hover | card surface, shadow-1 / shadow-2 | plus border | unchanged |
| Primary settings card | card surface | plus border | unchanged |
| Flat section | none, hairline `border` above | same | n/a |
| Statistics tile value | `text-strong` at `text-display` (tokens-v2) or `text-h1` until then | same | exists |

## Risks / Trade-offs

- [Twelve soft fills on a busy week look busier than outlines] → the soft step is low-chroma by construction; the past is dimmed; events are neutral; the Week story at 1280 px with a full seed is the check, and the hue table can be tuned in `tokens-v2` without touching this change.
- [Strong text on some soft hues fails 4.5:1 in dark] → measured by the extended pairs test in task 1.2 before any view changes; a failing hue is fixed in the hue table (a token change, in scope here as a value correction).
- [`color-mix` support] → shipped in every browser the app supports since 2023; the existing stylesheet already uses it.
- [The hatched edge renders blurry on 1× screens] → 45° at 3 px with two colours; verified in the Week story at 1× in the ui-check run, fallback is a dotted edge.
- [Settings pages whose primary card is offline show a raised card with "needs a connection"] → that is the right emphasis: the page's main state is unknown, and the anatomy is unchanged.
- [Baselines for about 20 stories churn] → regenerated once from CI's artifact in one commit, as the other October changes did.

## Migration Plan

Web-only, no data. Ships as one release with regenerated screenshots in `docs/`. Rollback is a revert of the pull request; nothing persists except the per-device all-day expansion set, which an older build ignores.

## Open Questions

- Whether the all-day cap should be two at 375 px instead of three; decided from the phone story's baseline, no spec change (the requirement says "at most three").
- Whether `tokens-v2` lands a `text-display` step before this change is applied; until it does, tiles use `text-h1` and the swap is one class.
