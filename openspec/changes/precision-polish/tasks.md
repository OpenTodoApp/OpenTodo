# Tasks

## 1. Grey selection and calmer review header

- [x] 1.1 Trash, Labels, Updates, calendar lanes and the timeline use `bg-selected-row` for the selected row; the time list, workspace list, When project list and the sidebar's collapsed More and footer buttons use `bg-selected` with strong text (verified: `npm test`, UI baselines)
- [x] 1.2 The selection bar is `bg-selected` without the accent border (verified: `bulk.test.tsx`, UI baselines)
- [x] 1.3 Weekly review step header: no tint, icon on the raised surface, step line in the faint tone, no ring on the code-focused title (verified: `npm test`, UI baselines)

## 2. Layout faults

- [x] 2.1 Trash rows keep 12 rem for the name and wrap their actions under it on a phone (verified: UI baselines at 390 px)
- [x] 2.2 The Updates feed's project line is left-aligned and truncated (verified: UI baselines at 390 px)
- [x] 2.3 The week agenda shows one quiet line per empty day (verified: `npm test`, UI baselines)

## 3. Text size

- [x] 3.1 Every script media query uses rem (40, 48, 64 rem); tests stub `matchMedia` through `minWidthPx` (verified: `npm test`)
- [x] 3.2 All projects moves the health under the name below an 18 rem table (verified: `projectsView.test.tsx`, larger-text screenshots)
- [x] 3.3 Inbox Process keeps only its icon below 21 rem (verified: larger-text screenshots)

## 4. Known issues

- [x] 4.1 Bulk label pick decides add or remove from the stored tasks (verified: `bulk.test.tsx` "removes it, even when picked at once" fails before the fix)
- [x] 4.2 Timeline notes avoid the today line and the axis end through `notePlacement` (verified: `timelineView.test.tsx`)

## 5. Overdue

- [x] 5.1 The health label reads Overdue, translated in five languages, with the catalog refreshed (verified: `make i18n-check`, `projectsView.test.tsx`)
- [x] 5.2 docs/all-projects.md and the help bundle say Overdue (verified: `make docs-check`)

## 6. Ship

- [x] 6.1 CHANGELOG entry under Unreleased (verified: review)
- [x] 6.2 `npm test`, `npm run build`, `npm run lint`, `make openspec-validate`, `make docs-check` pass; UI baselines refreshed from CI's "UI baselines" workflow (verified: CI green)
