# Design

## Context

The round-2 mock-ups (`design-references/round2/`, `system.md` "Shell", "Day page head", "Compact header", "Sidebar toggle") and the reference board (refs 01–04) define the shell. `precision-tokens` already provides the surfaces (`bg-surface`, `bg-selected`, `rounded-surface`).

## Decisions

### D1. Two page heads, one component

`PageHeader` gains `kind: 'day' | 'tool'` (default `tool`) and a `briefing` slot.

- **Tool:** one row, at least 46 px, with a hairline under it. In order: the sidebar toggle, Back, the icon or `leading` dot, the title at `text-h3` (14 px semibold), and the lead line beside the title (metadata size, muted, cut with an ellipsis). The actions, overflow and Help sit at the right.
- **Day:** a top row with the toggle and Back on the left and the actions on the right. Under it, the title at `text-display` with the lead line beside it at the prose step. Under that, the briefing at the prose step, at most 72 ch wide.
- **Today and Upcoming** pass `kind="day"`. Every other page keeps the default, so the 33 screens with a `PageHeader` get the compact head without code changes.
- **Phones:** the bar logic below 768 px is unchanged.

### D2. The sidebar toggle without app code in the design system

- **A registry in shared UI:** `ui/patterns/sidebarToggle.ts` is a small store, like `pageBar.ts`. The shell registers `{collapsed, toggle, shortcut}`, and `PageHeader` renders the toggle from it from 1024 px (the width where the sidebar collapses).
- **Outside the shell nothing is registered** (the workbench, the capture or task page screens), so no toggle appears there.
- **The control:** pressed while the sidebar is expanded, labelled "Hide sidebar" or "Show sidebar", with the `[` shortcut in its tooltip, and `data-sidebar-toggle` for tests.
- **The footer** keeps its Expand control only on the collapsed rail, where it is the nearest control.

### D3. Full width, one inset surface

- **The surface:** from 768 px, `<main>` is the inset surface: `md:my-2 md:mr-2`, `rounded-surface`, a `border-default` hairline, `bg-surface`, overflow hidden. The outer shell and the sidebar are `bg-canvas`, and the sidebar has no right border from 768 px.
- **No frames:** `.page-frame` keeps no width. The `60/72/80 rem` rules, the standalone gutter rule and the project frame are removed, and `PAGE_FRAME` drops its `max-w-[80rem]`.
- **Forms:** a form page keeps its fields at 42 rem (`> :not([data-page-header]) { max-width: 42rem }`), while its header spans the surface.
- **The sticky header** is `bg-surface` from 768 px; it was translucent canvas with blur.
- **Nothing moves:** the panel still docks to the right of `<main>`, so the surface narrows from its right side.
- **The existing e2e frame checks still pass:** the same left edge, actions ending at the content's right edge, nothing moving when a task opens.

### D4. Key sequences in tooltips

- **`KeySequence`:** a new component in `Tooltip.tsx` renders `"g t"` as `G then T` (each step a key badge, "then" translated) and a chord or single key as one badge. `Tooltip`'s `shortcut` uses it.
- **Sidebar destinations:** each gets a tooltip `Go to {page}` with its `g` key from the registry (`GO_KEYS`), unless the destination already has its own tooltip text, which then also shows the key.

### D5. Neutral active sidebar row

- **Active:** `bg-selected font-medium text-strong`; the icon follows the text instead of turning accent, and the count turns muted, since the faint tone never sits on `selected`.
- **Hover:** `bg-hover`.
- **Contrast:** the pairs are already in `pairs.ts` (precision-tokens).

## Risks

- **Pages that relied on the frame width** to keep long lines readable now stretch across the surface. Rows are one line after `precision-rows`, so lists are fine; help articles keep their own 70 ch cap.
- **Settings** shows its toggle after the settings navigation rather than at the surface's left edge until `precision-settings` lays that page out.
