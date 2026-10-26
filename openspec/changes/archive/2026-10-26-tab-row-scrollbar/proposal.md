# Proposal

## Why

Issue [#445](https://github.com/OpenTodoApp/OpenTodo/issues/445) (v0.14.0, Chrome): a small vertical scrollbar shows at the right end of the task panel's Comments / Activity / History / Time tab row. The row is one line high and has nothing to scroll vertically, so the bar is pure noise. It also makes the row count as a scroll region it is not.

The cause is in the shared tab row (`web/src/ui/Tabs.tsx`), so every tab row in the app has it, not only the task panel:

- The row sets `overflow-x: auto`, so that it can scroll sideways on narrow screens. CSS then computes `overflow-y` as `auto` too.
- Each tab has a 2 px bottom border and a −1 px bottom margin, so the selected tab's underline overlaps the row's 1 px baseline. That pushes the content 1 px below the row's padding box.
- With `overflow-y: auto`, the browser answers that 1 px with a vertical scrollbar, drawn 6 px wide by the app's `.ui-scroller` style.

The layout check did not catch it because it ignores overflows of up to 1 px when it counts vertical scroll regions.

## What Changes

- A tab row scrolls only sideways. It never scrolls vertically and never shows a vertical scrollbar, whatever its width, zoom or font size.
- The selected tab's underline stays fully visible: 2 px, sitting on the row's baseline, as today.
- Sideways scrolling of a row wider than the screen, keeping the selected tab in view, is unchanged.
- The layout check fails when any tab row can scroll vertically, even by 1 px, so this does not come back.

No data, op, API or environment-variable change. Not **BREAKING**.

**Out of scope**: other one-line scrollers such as the When segments (`WhenControl.tsx`). They do not overlap a baseline, so they have no vertical overflow today. Also out of scope: the visual design of the tabs, and the general 1 px tolerance of the scroll-region count (kept, because sub-pixel rounding elsewhere is not a bug).

ROADMAP.md: no numbered row. This is a bug fix to the shipped design system (row 9, Precision).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a new requirement, "Tab rows scroll only sideways": a tab row scrolls only sideways, never shows a vertical scrollbar, and shows the selected tab's underline in full. It's added beside "Surfaces and data display" rather than merged into it, which keeps that requirement under the 500-character limit.

## Impact

- **Code**:
  - `web/src/ui/Tabs.tsx`: the row draws its baseline without the overlapping negative margin, and sets vertical overflow to hidden.
  - `web/src/index.css`: only if the baseline needs a component class.
- **Callers that get the fix without changes**: the task panel's conversation tabs (`ConversationTabs.tsx`), the project view (`ProjectsView.tsx`) and the workspaces settings (`WorkspacesSettings.tsx`).
- **Tests**:
  - `web/src/ui/surfaces.test.tsx`
  - `scripts/ux-audit/measure.mjs` and `scripts/e2e-layout.mjs`: a zero-tolerance check for tab rows.
  - The Storybook baselines of `Surfaces/Tabs` and `Task/Panel`, if pixels move.
- **Dependencies**: none.
- **Issue**: Fixes #445.
