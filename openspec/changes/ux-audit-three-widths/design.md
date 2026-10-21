# Design

## Context

See proposal.md for the motivation. Relevant current state, read from the code on 2026-10-21:

- Three tours exist and keep three screen lists: `scripts/e2e-layout.mjs` (102 screen and overlay names, 360/390/768 px, light and dark, Chromium and WebKit, axe serious and critical, overlays, 44 px touch targets; `OPENTODO_LANG` is supported but CI never sets it), `scripts/screens.mjs` (12 before-and-after shots at 1280 and 390 px from the demo fixture) and `scripts/docs-screenshots.mjs` (the documentation images). None opens a screen at a desktop width with checks, none measures the budget rules on the built app.
- The budget rules are vitest tests over fixtures (`web/src/app/budget.test.tsx`: `MAX_SCROLLERS`, `MAX_CHROME_ROWS`, `MAX_EMPTY_TASK_ITEMS`, `MAX_CALM_ROW_ITEMS`) and the layout check (`verticalScrollers`, `pageOverflow`, `smallTargets` in `e2e-layout.mjs`). The measurement functions are the right ones; they are not shared.
- The accessibility gate on stories (`scripts/ui-check/a11y.mjs`) runs axe only. The `design-system` requirement "One focus style" says the gate includes a focus-visibility check on the core-screen stories; it does not.
- `design-system` "Core screens in the workbench" lists nine screens. Interface-guide rule 9 says every core screen. There are 21 `Screens/*` story titles; routes with no story at all: triage, labels, filter, views, feed (Updates), completed, trash, next, waiting, someday, anytime, ask, month, the timeline layout, import, help, share (capture), display, public, invite, project-invite, and the signed-out screens (sign in, setup, forgot, reset, verify).
- The token lint (`web/src/ui/tokens/styleLint.ts` `nativeTitles`) reports `title=` only on lower-case HTML tags. `Button` spreads `...rest` onto its `<button>`, so `<Button title="…">` renders a native title the lint cannot see; `web/src/app/assistant/AskEntry.tsx:40` does exactly that.
- Two screens print "Nothing here." as a bare paragraph instead of the `EmptyState` pattern that the interface guide requires: `web/src/app/DashboardView.tsx:240` and `web/src/app/calendar/PlanPanel.tsx:78`.
- `web/src/app/PlanView.tsx:270` renders each day's Add button with `tabIndex={-1}` and shows it on hover or focus within the day; the day cell itself is focusable, and the panel offers the quick add for a focused day, so a keyboard path may exist. The audit decides with evidence (finding F10).
- Open changes `calm-rows`, `quiet-sidebar`, `lean-chrome`, `settings-copy` and `ux-feedback-2` modify `task-list-presentation`, `app-shell`, `first-run`, `settings-navigation` and `design-system` "Settings section and row patterns". They are expected to archive within the hour; this change is written against their archived text and modifies none of the requirements they touch. The one `design-system` requirement this change modifies, "Core screens in the workbench", is modified by no open change.
- The catalogs live in `web/src/locales/*.json`; German is the longest.

## Goals / Non-Goals

**Goals:**
- One inventory that every screen script reads or is checked against, so a new route cannot be forgotten by any tour.
- A tour that measures rather than looks, with the same functions the unit tests and the layout check already use, and a report a maintainer can read in five minutes.
- A ranked, evidence-backed fix list, with the mechanical fixes done here and the rest named as follow-ups.
- Zero effect on the shipped app, binary or image.

**Non-Goals:**
- Replacing the layout check or the UI check: the tour sits beside them and reuses their measurement functions.
- WebKit coverage for the tour (the layout check keeps it; Chromium is enough for measurements that are geometry and DOM).
- Pixel baselines for the tour's screenshots: they are a contact sheet for people, not a regression gate (the workbench already gates visuals).
- Fixing findings that change a screen's design, copy or information architecture.

## Decisions

**D1. The inventory is data, next to the scripts.** `scripts/ux-audit/screens.json`: an array of entries `{id, route, kind: "screen"|"overlay"|"settings"|"signed-out"|"display", seed: "<fixture>", open?: "<how to reach an overlay>", frequency: "daily"|"weekly"|"rare", core: boolean, layoutCheck: "<name>"|null, layoutCheckReason?: string, story?: "Screens/<title>"}`. A `node --test` file asserts: every `view` literal of `web/src/app/router.ts` `Route` appears as a route; every `layoutCheck` name is in `e2e-layout.mjs`'s list (read by a regex over the file, the same way the layout check itself names screens); `core` is true exactly when `frequency` is daily or weekly. Alternative: a TypeScript module under `web/src` imported by the tests. Rejected: the tours are plain Node scripts outside the web package and should not import from it; JSON is read by both.

**D2. The tour reuses the layout check's helpers instead of copying them.** `verticalScrollers`, `pageOverflow`, `smallTargets`, `axeProblems` and the seed function move from `scripts/e2e-layout.mjs` into `scripts/ux-audit/measure.mjs` and `scripts/ux-audit/seed.mjs` and are imported back by the layout check, so both measure the same thing. The budget constants (`MAX_SCROLLERS`, `MAX_CHROME_ROWS`, `MAX_EMPTY_TASK_ITEMS`, `MAX_CALM_ROW_ITEMS`, the six-destinations limit) are read by the tour from a small JSON the vitest file also imports (`web/src/app/budget.json`), so one number lives in one place. Alternative: duplicate the functions. Rejected: the two tours would drift the way the three screen lists did.

**D3. Measurements, rules and thresholds.** Each measurement is a function run in the page and returns `{rule, element, value, limit}` records; a record is a violation when `value` breaks `limit`. The list:

| Id | Rule | Where | Limit |
| --- | --- | --- | --- |
| M1 | axe-core, tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa | every capture | 0 serious or critical |
| M2 | rows of chrome above the first list item (`[data-list-page]` children before the first row, as `budget.test.tsx` counts them) | list screens | ≤ `MAX_CHROME_ROWS` |
| M3 | task properties visible by default: facet parts and chips of the seeded empty task's panel; metadata items of a Calm row in Today | panel, Today | ≤ `MAX_EMPTY_TASK_ITEMS`, ≤ `MAX_CALM_ROW_ITEMS` |
| M4 | primary sidebar destinations (`[data-sidebar-primary] a`) | every signed-in screen | ≤ 6 |
| M5 | vertical scroll regions outside `[data-scroll-y]` and overlays | every screen | ≤ `MAX_SCROLLERS` |
| M6 | horizontal overflow: `scrollingElement.scrollWidth` and every element's right edge outside `[data-scroll-x]` | every capture, both languages | ≤ viewport width |
| M7 | target size: bounding box of every interactive element, touch (360, 768 with `hasTouch`) and fine pointer (1280); exceptions per WCAG 2.2 2.5.8 (inline links, 24 px spacing) | every capture | ≥ 44 touch, ≥ 24 fine |
| M8 | focus visibility: Tab through every focusable element, compare `getComputedStyle` outline and box-shadow before and after focus with the token ring (`--ot-focus-ring` colour present) | every screen, 1280 light and dark | 0 elements without the ring |
| M9 | contrast is M1's `color-contrast`, reported under its own heading | every capture | 0 |
| M10 | truncation: elements with `text-overflow: ellipsis` and `scrollWidth > clientWidth` whose text is not in their own `aria-label`, a `[data-tooltip]` or `[role=tooltip]` wired by `aria-describedby`, or an `sr-only` sibling | every capture, both languages | 0 |
| M11 | overlap: pairs of visible interactive elements whose boxes intersect by more than 4 px on both axes | every capture | 0 |
| M12 | layout shift: `PerformanceObserver` `layout-shift` entries summed from navigation to network idle | every screen, first load | ≤ 0.1 |
| M13 | time to first interaction from the local copy: second load of the Inbox with the server process stopped, navigation start to the first `[data-task-row]` | Inbox, Today, a project, 1280 | reported; strict limit set after three CI runs (expected under 1,000 ms) |
| M14 | story coverage: every inventory entry with `core: true` has a `Screens/<story>` title in `web/src/**/*.stories.tsx` | repository | 0 missing |
| M15 | reduced motion: with `prefers-reduced-motion: reduce` emulated, complete a task, open the panel and a sheet, and read `document.getAnimations()` for keyframes or transitions on `transform`, `translate`, `scale`, `width`, `height`, `top`, `left` | Today, panel, a dialog | 0 running |
| M16 | language: M6 and M10 are run in English and German; a violation present only in German is marked `language-only` | every capture | as M6, M10 |

Alternative for M8: axe's `focus-order-semantics` rule. Rejected: it checks order, not visibility. Alternative for M13: Lighthouse. Rejected: a dependency and a page model that does not know the local copy.

**D4. The rubric.** Severity S4 blocks a task (a control cannot be reached or read, content is cut off), S3 makes a task slower or error-prone (small target, no focus ring, no empty-state action), S2 is inconsistent with the interface guide (bare text instead of `EmptyState`, a native title), S1 is cosmetic (a 2 px misalignment). Frequency F3 is a daily screen (Inbox, Today, Upcoming, a project's list and board, the task panel, quick add, the sidebar, the palette), F2 weekly (calendars, review, statistics, labels, filters, settings, Updates, Completed, Trash, Ask), F1 rare (sign-in and setup, invitations, import, display, public lists, help, capture). Score = S × F; the report sorts by score, then by the number of captures showing the finding. Mechanical fixes are those with a one-line rule and no design choice (S2 and below, or a missing attribute); everything else goes to a follow-up.

**D5. Seeded findings** (from the code, before the first tour; the tour confirms, scores and extends them):

| # | Finding | Evidence | Score | Fix |
| --- | --- | --- | --- | --- |
| F1 | A native `title` on the Ask entry's button, invisible to the title lint because `Button` is a capitalised tag that spreads `title` through | `web/src/app/assistant/AskEntry.tsx:40`; `web/src/ui/tokens/styleLint.ts:74`; `web/src/ui/Button.tsx` `...rest` | S2 × F3 = 6 | Lint the `Button` and `IconButton` tags' `title=` too; the entry uses the button's name and `shortcut` for its tooltip (task 4.1) |
| F2 | Bare "Nothing here." paragraphs instead of `EmptyState` | `DashboardView.tsx:240`, `calendar/PlanPanel.tsx:78` | S2 × F2 = 4 | `EmptyState compact` with the sentence the view needs and no action (task 4.2) |
| F3 | Twenty-six routes without a story; rule 9 unenforced | the story list against `router.ts` | S3 × F2 = 6 (weekly ones), S3 × F1 = 3 (rare ones) | Stories for the daily and weekly ones here (tasks 5.x); `screen-stories-rare` for the rest |
| F4 | The layout check never runs at 1280 px and never in German in CI | `ci.yml` layout job, `e2e-layout.mjs` `WIDTHS` default | S3 × F3 = 9 | The tour covers 1280 and German; a German 360 px Chromium leg joins the layout job (task 6.3) |
| F5 | Target size is checked at 44 px on touch only; no 24 px fine-pointer check | `e2e-layout.mjs:65` `MIN_TARGET` | S3 × F3 = 9 | M7 (task 2.3) |
| F6 | The focus-visibility check promised by "One focus style" is missing from the accessibility gate | `scripts/ui-check/a11y.mjs` has no focus pass | S3 × F3 = 9 | Task 4.3 |
| F7 | 104 `truncate` sites in screens with no rule that the full text is reachable | `grep truncate web/src/app` | S3 × F3 = 9 (where the full text is missing) | M10 measures; the tour's first run lists the offenders; mechanical ones (add the name to `aria-label` or the `Tooltip`) are fixed in task 4.5, the rest in `ux-fixes-phone` |
| F8 | Three screen lists drift (102 in the layout check, 12 in `screens.mjs`, the docs shots) | the three scripts | S2 × F3 = 6 | One inventory and a test that the lists agree (tasks 1.x) |
| F9 | Measurement functions duplicated between the budget test and the layout check | `budget.test.tsx` `scrollers`, `e2e-layout.mjs` `verticalScrollers` | S1 × F3 = 3 | D2 (task 2.1) |
| F10 | The Plan view's per-day Add button is outside the tab order (`tabIndex={-1}`) | `PlanView.tsx:270` | S3 × F2 = 6 if no other keyboard path | M8 and task 4.4 decide: either a registered key on the focused day or the button in the tab order |
| F11 | Reduced motion is honoured globally in `index.css` (line 570) but 23 screens add their own `transition`/`animate-` classes with no test | `grep` over `web/src/app` | S2 × F3 = 6 | M15 measures; violations fixed in task 4.6 |
| F12 | The tap-target check on touch runs only where the layout check opens overlays; the panel's facet popovers at 360 px are opened by the layout check but never measured for 24 px spacing | `e2e-layout.mjs` `checkOverlay` | S3 × F3 = 9 | M7 on overlays (task 2.3) |
| F13 | "Nothing here." breaks the empty-state copy rule (one sentence naming what would be here) | interface guide "Rows and chips" | S2 × F2 = 4 | With F2 |
| F14 | "Core screens in the workbench" names nine screens; the rule and the check disagree | `design-system` spec | S2 × F3 = 6 | The requirement is rewritten to the inventory and checked by M14 (task 3.4) |

**D6. The tour's shape.** `scripts/ux-audit/tour.mjs`, Node and Playwright like the other tours (global Playwright, `CHROMIUM_PATH`), a throwaway `bin/opentodo` on a free port with a fresh data directory, seeded through the REST API by the shared `seed.mjs` (the layout check's seed: two users, four projects, sections, labels, tasks in every state, comments, attachments, a saved view, a dashboard, a habit, a recurring task, a location). One browser context per width × theme × language (12 contexts), `CONCURRENCY` 3 as the layout check, `ONLY=<ids>`, `WIDTHS`, `THEMES`, `LANGS`, `OUT_DIR` (default `ux-audit-report`). German is set the way the layout check does (`OPENTODO_LANG`: the synced preference written before capturing). Each entry: navigate, wait for the entry's ready signal (the inventory's `ready` selector, as `screens.mjs` does with headings and regions), open the overlay if any, settle transitions (the a11y gate's technique), capture, run M1 to M11 and M16, close the overlay. M12 is read from a `PerformanceObserver` installed by `addInitScript`. M13 runs last: stop the server process, reload the three screens, time the first row. M15 runs in a context with `reducedMotion: 'reduce'`. The report: `report.json` (`{run, captures: [{id, width, theme, lang, shot, violations: [...]}], summary: {byRule, byScreen, ranked}}`) and `index.html` (one row per inventory entry, 12 thumbnails, the violation count per cell, a ranked table at the top, no script, no external asset). Strict mode `UX_AUDIT_STRICT=1` exits non-zero on M2 to M6 and M14; the rest are always reported only, so axe and target size keep failing in the layout check where they already do.

**D7. CI.** A job `ux-audit` in `ci.yml` after `web`, Chromium only, `continue-on-error: true`, uploading `ux-audit-report`; `UX_AUDIT_STRICT` is set from a repository variable so the maintainer turns it on without a change to the workflow. Cost: 12 contexts × about 60 entries = about 720 captures; the layout check does 102 × 6 in about 12 minutes on the Chromium leg, so the tour is estimated at 8 to 10 minutes with concurrency 3, plus the M13 reloads; a `timeout-minutes: 30`. The German layout leg adds one Chromium run at 360 px, about 4 minutes. No new dependency (Playwright global as today, axe-core from `web/node_modules`), so no change to the production bundle, the binary or the image.

**D8. Fixes done in this change.** Only mechanical ones (D4): F1, F2 and F13, F3's daily and weekly stories, F6, F8, F9, F11's measured violations, the mechanical part of F7, F10 as the evidence decides, and F4 and F5 as the tour itself. Interface budget: the change adds no chrome, no property, no destination, no scroll region and no shortcut; `EmptyState compact` replaces a paragraph in place. The two `budget.test.tsx` limits stay as they are. Stories for the new screens use the existing `withSeed` and `withClock` fixtures and the `Screens/` title convention, so baselines come from the UI baselines workflow (`ui-baselines.yml`) or CI's `ui-check-report` artifact, as every open change does.

**D9. What a finding needs to become a fix in a follow-up.** `ux-fixes-phone` takes the S3 and S4 findings on daily screens at 360 px; `screen-stories-rare` the stories for rare screens; `motion-polish` the M15 violations that need a design choice (a different animation, not just removal). The first tour's `report.json` is attached to each follow-up's proposal, so they start from evidence.

## Risks / Trade-offs

- [The tour is slow or flaky on the runner] → non-blocking first, Chromium only, `ONLY` for local use, a retry of a capture once on a navigation timeout (as the layout check's `runCombo` does), and strict mode limited to deterministic DOM measurements.
- [M8 (focus) and M10 (truncation) produce noise from elements that are intentionally unfocusable or truncated with the full text elsewhere] → explicit exemptions in the inventory per element selector with a reason, counted in the report, and the rubric scores them before anyone acts.
- [M13 timing varies with the runner] → reported for three runs before any limit; the limit is a strict-mode option, not a default.
- [Baselines for about 15 new stories need Docker] → generated by the UI baselines workflow, the same path every open change uses; the stories themselves are verified by `npm run build-storybook` and the a11y gate without baselines.
- [Moving helpers out of `e2e-layout.mjs` breaks the layout check] → the layout check's own CI legs run on the same change; the helpers keep their names and signatures.
- [Rewording "Core screens in the workbench" while five changes are archiving] → no open change modifies that requirement; the delta is written against the current main text.

## Migration Plan

Nothing to deploy. Rollback is deleting `scripts/ux-audit/` and the CI job. The German layout leg and the focus pass in the accessibility gate become ordinary CI checks once green; if either is red on `main` for reasons outside this change, it is the one legitimate reason to mark the leg non-blocking until fixed.

## Open Questions

- The strict limit for M13 (first interaction from the local copy): set after three CI runs; the specs say "reported" until then.
- Whether `screens.mjs` keeps its 12-shot list or reads the inventory's `core` entries at 1280 and 390 px: either satisfies the inventory test; the task leaves it reading the inventory, the smaller change.
