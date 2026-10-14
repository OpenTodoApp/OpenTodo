# Design

## Context

- Tokens live in `web/src/index.css` as `--ot-*` values (light on `:root`, dark under the system preference and under `[data-theme="dark"]`) and are exposed as semantic utilities by `@theme inline` (`bg-surface`, `text-muted`, `border-input`, `bg-accent`, `text-danger`, `bg-hue-soft` ...). A token utility already switches with the theme, so a screen needs no `dark:` variant for colour.
- `web/src/ui/tokens/lint.test.ts` rejects raw palette classes and hex literals in `src/ui`, and allows a hex on a line with `color=` (stored data). `pairs.ts` and `contrast.test.ts` check every allowed foreground/background pair in both themes.
- Measured usage in `web/src/app`: about 865 raw classes in 58 files when planned, about 810 in 57 files after `task-detail-redesign` merged (the task panel moved to `app/task-detail/` and still carries some raw classes). Slate makes up about 480 of them, red 137, emerald 128, amber 94, sky 18, others under 10. The most common are `text-slate-600` / `dark:text-slate-300`, `text-red-600` / `dark:text-red-400`, `border-slate-200` / `dark:border-slate-800`, `dark:bg-slate-900` / `bg-slate-100`. Fixed `bg-white` (22), `text-white` (8) and black scrims (`bg-black/30`, `/40`) also occur. The component layer of `index.css` (`.notes-editor`, `.help-prose`, task checkbox, `mark`) has about 25 raw classes.
- Raw hex in screens: fallback grey/emerald for projects without a colour in `CalendarView` and `FeedView` (drawn with `style=` as raw stored hex, bypassing `hueFor`), the colour list in `ProjectHeader`, and story fixtures in `*.stories.tsx`.
- 80 of the 600 visual baselines come from settings stories in `web/src/app`. Every other screen is covered only by the layout check (geometry, not colour) and by `scripts/screenshots.mjs`, which seeds demo data and captures about 35 real screens.

## Goals / Non-Goals

**Goals:**
- Zero raw colour in screens and component classes outside a shrinking, named allow-list, enforced by the existing lint.
- Accent and success separated everywhere, so a later accent change touches only what it should.
- Reviewable in slices, with no shared-file contention with the open redesign changes.

**Non-Goals:**
- Changing any token value, or adding theming hooks (`data-accent`, mode override). Those belong to `theming`.
- Tidying layout, spacing or markup while a file is open. Colour classes only, so diffs stay reviewable.

## Decisions

### D1. Mapping by meaning, with a reference table
Each raw class maps to the token for its role, and its `dark:` partner is deleted. The table below covers about 90 % of occurrences, and anything outside it is decided case by case using the same roles:

| Raw (light / dark) | Token |
| --- | --- |
| `bg-white` / `dark:bg-slate-900` (cards, panels, inputs) | `bg-surface` |
| `bg-slate-50` / `dark:bg-slate-950` (page) | `bg-canvas` |
| `bg-slate-100`, `bg-slate-50` (wells, hovers) / `dark:bg-slate-800` | `bg-sunken` (dark hovers `dark:hover:bg-raised`, as the button classes already do) |
| `text-slate-900` / `dark:text-slate-100` | `text-default` (headings `text-strong`) |
| `text-slate-600`, `-700` / `dark:text-slate-300`, `-400` | `text-muted` |
| `text-slate-400`, `-500` (hints, placeholders) | `text-faint` |
| `border-slate-200`, `-100` / `dark:border-slate-800`, `-700` | `border-default` |
| `border-slate-300` / `dark:border-slate-700` on inputs | `border-input` |
| emerald for buttons, links, selection, focus rings, current nav | `bg-accent`, `text-accent`, `bg-accent-soft` + `text-on-accent-soft`, `ring-focus` |
| emerald for done, saved, success, connected | `text-success`, `bg-success-soft` + `text-on-success-soft` |
| red text and borders | `text-danger`, `border-danger`, `bg-danger-soft` + `text-on-danger-soft` (priority markers use `p1`) |
| amber | `text-warning`, `bg-warning-soft` + `text-on-warning-soft` |
| sky, blue notices | `text-info`, `bg-info-soft` + `text-on-info-soft` |
| `text-white` on solid accent or status | `text-on-accent` |

Alternative considered: a mechanical codemod from shade to token. Rejected because the same `emerald-600` means "accent" in one place and "success" in another. That distinction is the point of the change, and only a reader can make it. A codemod can still pre-fill the unambiguous slate cases, but each file is reviewed by meaning.

### D2. Missing meanings become tokens
The audit already shows three needs the tokens lack:
- an overlay scrim, today `bg-black/30` and `bg-black/40`
- search and help highlighting, today `mark` with `bg-amber-200`
- the calendar's hour lines and today column

Each gets a named token (for example `--ot-scrim`, `--ot-highlight`, and a grid line reusing `border-default` if contrast allows) with light and dark values. Any new text pair goes into `pairs.ts`, so the contrast check covers it. No token value that exists today changes.

### D3. Lint scope and allow-list
`lint.test.ts` extends its glob to `src/app/**/*.tsx` (excluding tests and stories) and adds a pass over the `@layer components` block of `index.css`. The palette regex gains `white` and `black` for colour utilities. A hex on a `color=` line stays allowed, and story fixtures are exempt like tests, since they are stored data. The allow-list is a constant in the test, with a comment naming the owning change for each entry:
- `labels-and-menus`: `LabelsView.tsx`, `ViewsView.tsx`, `Sections.tsx`, `ProjectHeader.tsx`

A test asserts the list has no more than these entries, so it can only shrink. `ProjectHeader`'s raw colour list stays until `labels-and-menus` moves the project menu onto the shared picker. That change takes the palette requirement with it.

Alternative considered: one lint per directory, or a separate script in `scripts/ui-check.mjs`. Rejected because one test with one regex keeps a single definition of "raw colour", and vitest already runs in `make check`.

### D4. Stored colours through `hueFor`
`CalendarView` and `FeedView` stop writing `style={{ borderLeft/backgroundColor: color }}` with the raw stored hex. They use `data-hue={hueFor(color)}` with the hue utilities, the same path as label chips. A project without a colour uses the `slate` hue instead of a hard-coded grey or emerald. No op is written; this is rendering only.

### D5. Slicing and verification
The work is cut by area, each slice a separate commit that leaves `make check` green, and the files of each slice are removed from a temporary "not yet migrated" list in the lint as they land:
1. Lint scaffolding (new scope, white/black, CSS layer, allow-lists), with every currently dirty file listed.
2. Shell and navigation (Sidebar, Shell, SyncStatus, NotificationBell, QuickAdd).
3. Lists and rows (TaskRow, TaskListView, Board, Filter, SavedView, Dashboard, Feed, Trash).
4. Calendar and time blocking.
5. Auth, invite and reset screens.
6. Settings panels (the ones with stories).
7. Import, help, share capture and the remaining small files, plus the `index.css` component layer.

The second list ("not yet migrated") exists only during the change and must be empty before the last task. It is separate from the redesign allow-list, which outlives the change.

Verification per slice:
- `npm test` (lint, contrast) and `npm run build`.
- For slices without stories, run `scripts/screenshots.mjs` against a fresh server before and after in light and dark, and compare side by side.
- For the settings slice, regenerate baselines once through the "UI baselines" workflow and review the diff images.

## Risks / Trade-offs

- [A shade moves visibly (for example muted text a step lighter)] → Accepted by the spec when it lands on a token that passes contrast. Anything else is fixed before merge.
- [Accent/success misclassified, so theming later recolours a "done" state] → Called out in D1. Review checks every emerald by role, and `theming` will make a mistake visible at once in a non-emerald theme.
- [Merge conflicts with the redesign branches] → Their files are allow-listed and untouched. Sidebar is shared with `labels-and-menus` but only for unrelated lines. Whichever lands second rebases.
- [Large diff fatigue in review] → Seven slices, colour-only edits, each green on its own.
- [Size] → Utilities swap one for one and `dark:` partners disappear, so CSS output shrinks slightly. No dependency, no effect on the server binary, image size or runtime memory.

## Migration Plan

Client-only and data-free: no op schema change, no server change, no storage migration. Rollback is a revert of the slice commits. The baselines regenerated in slice 6 revert with them.

## Open Questions

- Exact names and values of the scrim, highlight and calendar grid tokens, settled while migrating slice 4 and 7 against the contrast check.
