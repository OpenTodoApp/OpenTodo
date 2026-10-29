# Design

## Context

- `scripts/ui-check/a11y.mjs` runs axe (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) on every story in light and dark, and walks focus on `Screens/*` stories. It's blocking in CI (`ui-a11y` job, 2 shards).
- `scripts/ux-audit/tour.mjs` opens every inventory entry (`screens.json`) against a throwaway seeded server at 360/768/1280, light and dark, English and German. It already runs `axeProblems` (serious and critical) and the measures in `audit-measures.mjs`: the M7 target size (24 px, or the spacing exception), a focus walk, and vertical scrollers. It runs nightly and on demand, and is non-blocking unless `UX_AUDIT_STRICT=1`.
- The keyboard alternatives exist for several drags: `manual-ordering` "Keyboard moves", `time-blocking` "Keyboard equivalent for every placement", `sections-and-boards` "Board data and keyboard access". WCAG 2.5.7 asks for a *single-pointer* alternative, which a keyboard shortcut isn't.

## Decisions

**D1. One gate for screens, built on the tour, not a second crawler.** `tour.mjs` gains `A11Y_ONLY=1`, which skips screenshots and budget measures and fails on accessibility findings only. The PR job `a11y-screens`:

- runs on 360 and 1280 px, light and dark, English;
- uses 2 shards of the inventory;
- runs only when `web/` or `scripts/ux-audit/` changed (the existing path filter).

The nightly Interface audit sets `A11Y_STRICT=1` for the full matrix, and a failure there goes to the existing nightly alert.

Alternative: run axe in vitest with happy-dom. Rejected: no layout, so no contrast, target-size or reflow results.

Alternative: only stories. Rejected: stories miss composition problems such as duplicate landmarks, focus order across panels and real data lengths.

**D2. Rules beyond axe, each tied to a criterion and measured in the browser.**

| Criterion | Measure | Pass rule |
|---|---|---|
| 2.4.7 Focus visible | focus walk (existing) on every inventory entry | every focused element shows the token ring |
| 2.4.11 Focus not obscured (min) | during the walk, `elementsFromPoint` at the focused rect's corners and centre | at least one point hits the focused element, not a sticky header, bottom bar, toast or sheet |
| 2.5.8 Target size (min) | M7 (existing) | ≥ 24×24 CSS px, or 24 px spacing |
| 1.4.10 Reflow | viewport 320×256 CSS px | no page-level horizontal scroll; listed 2-D regions (`calendar-day`, `calendar-week`, `month`, `timeline`, `board`) may scroll inside themselves |
| 1.4.12 Text spacing | inject the WCAG text-spacing bookmarklet CSS | no element whose `scrollHeight` > `clientHeight` + 1 with `overflow:hidden` and text content |
| 3.3.8 Accessible authentication | DOM check on sign-in, sign-up, 2FA, recovery and reset screens | password, `one-time-code` and recovery inputs have `autocomplete` and no paste blocking (`onpaste` returning false or `preventDefault` in a paste listener, tested by a synthetic paste) |

The 2-D region list is kept in `scripts/ux-audit/reflow-exempt.json` with a reason per entry, like `focus-exempt.json`. Serious and critical axe findings can't be exempted.

**D3. Dragging alternatives by inventory.** `scripts/ux-audit/drag-alternatives.json` maps each drag source to its single-pointer alternative:

| Drag source | Single-pointer alternative |
|---|---|
| list row reorder | row menu → Move up / Move down / Move to top |
| section reorder | section menu → Move up / Move down |
| board card between columns | row menu → Section ▸ |
| calendar block move | When popover (date and time) |
| calendar block resize | When popover (duration) |
| timeline bar | When popover |
| sidebar projects and views order | item menu → Move up / Move down |
| month/plan drag | When popover |

Drags today are native HTML drag and drop (`draggable`, `onDragStart`: `task-list/useListDrag.ts`, `Sidebar.tsx`, `PlanView.tsx`, `MonthView.tsx`, `TimelineView.tsx`, `LabelsView.tsx`, `FieldsDialog.tsx`, `DashboardView.tsx`) plus the calendar's pointer drags (`calendarDrag.ts`, `calendar/DayColumn.tsx`), and row swipes (`task-list/RowSwipe.tsx`, a path gesture under 2.5.1). Every drag or swipe source gets a `data-drag-id`. A vitest test (`web/src/lib/a11y/dragAlternatives.test.ts`) scans `web/src` for `draggable`, `onDragStart` and the calendar's pointer-drag entry points. It fails when a source has no `data-drag-id`, when an id isn't in the map, or when the map names a menu item id that doesn't exist in the action registry. Missing alternatives (Move up/Move down in some menus) are added by this change. They live in the existing row and item menus, so no chrome is added.

**D4. Manual audit as a record with a release gate.** `docs/accessibility/audit-<version>.md` has one row per core inventory entry (57 today) and these columns:

- keyboard only;
- NVDA + Firefox (Windows);
- VoiceOver + Safari (macOS);
- VoiceOver iOS shell;
- TalkBack Android shell;
- 200% zoom with text size 20.

Each cell is `pass`, `fail #<issue>`, or `n/a` with a reason (for example a desktop-only screen on the phone). It's run before 1.0.0 and then at least every 12 months. `scripts/accessibility.test.mjs` (repo-check) fails when:

- a core entry has no row;
- a cell is empty;
- a `fail` doesn't link an issue listed under the statement's known exceptions.

`release-prepare` refuses a release more than 12 months after the latest audit file's date.

Alternative: audit every release. Rejected: a full screen-reader pass is a few days' work. The automated gate covers regressions between audits.

**D5. Statement generated in part, written in part.** `docs/accessibility.md` has hand-written sections (commitment, method, feedback: issues labelled `accessibility` or the contact in `docs/feedback-and-support.md`, answered within 10 business days) and a results table between markers. `node scripts/accessibility-statement.mjs` fills the table from `screens.json` and the latest audit file, and the repo check fails when the committed table differs from the generated one. The conformance claim is "Fully conforms" only when there are no exceptions, and "Partially conforms" otherwise, which the generator writes.

**D6. Native shells.**

- **Android:** `lint` with `ContentDescription`, `ClickableViewAccessibility`, `LabelFor` and `TouchTargetSizeCheck` set as errors in `mobile/android` (`make android` already runs lint).
- **iOS:** a UI test calls `XCUIApplication().performAccessibilityAudit()` (Xcode 15+) on the server sign-in screen, the settings sheet and the widget configuration, in the existing iOS CI job.

The web content inside the shells is covered by D1.

**D7. Fix policy.**

- **Core screens:** all known failures fixed before 1.0.
- **Non-core screens:** failures may remain as exceptions with an issue and a target version, but never a Level A criterion.

Fixes are markup, names, roles, live regions and the D3 menu items. Visual changes must keep the interface budget: no new chrome rows, and the Move items go in existing menus.

## Data model impact

None.

## Size and memory

No new dependency (axe-core and Playwright are existing dev dependencies). No runtime change beyond small markup fixes. The `bundle-budget` check covers it.

## Interface budget

No new rows of chrome, properties, sidebar destinations, scroll regions or shortcuts. The only visible additions are Move up / Move down items in existing menus.

## Progressive disclosure

Nothing new to configure. Simple-list users see only the added menu items, which every user gets.

## Open questions for the owner

- An ACR/VPAT document for public-sector buyers, generated from the statement later?
- Who performs the manual passes: maintainers, or a paid tester with daily screen-reader use (recommended for NVDA and TalkBack)?
