# Proposal

## Why

The design refresh (`ux-overhaul`, `design-language`, `calm-rows`, `quiet-sidebar`, `lean-chrome`, `settings-copy`, `ux-feedback-2`) rebuilt the interface screen by screen, and each change proved its own screens with stories, the budget test and the layout check. Nothing measures the whole app at once: the layout check opens every screen at 360, 390 and 768 px but never at a desktop width and never in a language longer than English, the budget rules are measured on vitest fixtures rather than the built app, the focus-visibility check that the `design-system` spec promises is not in the accessibility gate, three scripts keep three different lists of screens, and about twenty routes have no story at all, so interface-guide rule 9 ("every core screen has a story") is a rule nobody can check. The next round of improvements should start from a measured picture of every screen at three widths, in light and dark, in English and German, with a ranked list, and then fix the mechanical findings in one go instead of taste-driven one-offs.

## What Changes

- **A screen inventory** (`scripts/ux-audit/screens.json`): every route of the web app, every settings section, the overlays reachable from each (dialogs, sheets, popovers, the task panel and its tabs), the display routes, the signed-out screens (sign in, owner setup, forgot, reset, verify, invitation, project invitation, public list), the capture screen, the start guide, the command palette and the sequence spotlight, each with the seed state it needs, its frequency of daily use, whether it is a core screen, and the name it has in the layout check. A test keeps the inventory complete: every `view` of the router is in it, and every entry is either in the layout check's list or says why not.
- **An audit tour** (`make ux-audit`): opens every inventory entry on the built app with a seeded account at 360, 768 and 1280 px, in light and dark, in English and German, saves a screenshot of each, and measures: WCAG 2.2 AA violations, the interface budget (rows of chrome above the first list item, visible task properties, primary sidebar destinations, vertical scroll regions), horizontal overflow, target size (44 px on touch, 24 px with a fine pointer), focus visibility on every focusable element, truncated text without its full text, overlapping controls, layout shift on load, time to first interaction from the local copy with the server unreachable, animations that still move under reduced motion, and whether each core screen has a story. It writes a JSON report and an HTML contact sheet, and it never changes the app.
- **A scoring rubric**: each finding is scored severity × frequency, so the fix list is ranked by how much it costs people every day, not by how visible it is on a screenshot.
- **Findings seeded from the code today** (fourteen, listed in design.md), each with file references, and the fixes that are mechanical and safe, done in this change: ad hoc empty states replaced by the `EmptyState` pattern, the native-title lint extended to the `Button` primitive's `title` prop, the focus-visibility check added to the accessibility gate, stories with baselines for the daily and weekly screens that have none, a keyboard path for the Plan view's per-day add control, one inventory consulted by the existing screen scripts, and a German leg of the layout check.
- **The tour in CI**: a separate non-blocking job that uploads the report on every code change; the budget, overflow and story-coverage measurements become blocking (`UX_AUDIT_STRICT=1`) once they are green on `main`.
- **Follow-up changes named by the first run**: `ux-fixes-phone`, `screen-stories-rare` and `motion-polish` take the findings that are not mechanical; they are not part of this change.

No data model, op schema, API or environment change. Not **BREAKING**. Nothing is added to the production bundle, the binary or the container image: every file lives under `scripts/` and `web/src/**/*.stories.tsx`.

**Out of scope**: redesigning any screen, new features, copy rewrites beyond consistency with the interface guide, the WebKit engine for the tour (the layout check keeps its WebKit legs), the docs website, the browser extension, the CLI, performance work beyond the one first-interaction measurement, stories and baselines for the rarely used screens (`screen-stories-rare`), and the fixes the first tour ranks as larger than mechanical.

ROADMAP.md: advances the "Next: Design refresh" programme, as the measurement step after its five changes; no table row is closed by it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `design-system`: "Core screens in the workbench" covers every core screen of the inventory and is checked by a script instead of a review checklist; new requirements "Screen inventory", "Audited interface rules" (target size with a fine pointer, no horizontal overflow at 360 px in every shipped language, truncated text carries its full text, focus visible on every control of every screen, no layout shift on load, nothing moves under reduced motion) and "Focus visibility in the accessibility gate".
- `web-app`: new requirement "Interface audit tour" (the tour, its measurements, its report, its place in CI and the strict mode), next to "Automated layout check".

## Impact

- `scripts/ux-audit/` (new): `screens.json`, `tour.mjs`, `measure.mjs`, `report.mjs`, `stories.mjs`, `ux-audit.test.mjs`; `Makefile` (`ux-audit` target); `.github/workflows/ci.yml` (one job, one more layout leg); `scripts/README.md`.
- `scripts/ui-check/a11y.mjs` (focus-visibility pass on the core-screen stories); `web/src/ui/tokens/lint.test.ts` (the `Button` `title` prop).
- `web/src/app/DashboardView.tsx`, `web/src/app/calendar/PlanPanel.tsx` (empty states), `web/src/app/assistant/AskEntry.tsx` (tooltip), `web/src/app/PlanView.tsx` (keyboard path), `web/src/app/budget.test.tsx` (shared rule constants exported for the tour).
- New stories under `web/src/app/**/*.stories.tsx` with baselines in `web/src/ui/__screenshots__/`.
- `docs/design-system.md`, `docs/interface-guide.md` (the audit, the rubric, rule 9 as a check).
- No new dependency: Playwright and axe-core are already used by the layout check; the contact sheet is plain HTML written by the script.
