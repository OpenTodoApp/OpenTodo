# Tasks

## 1. Today membership and tree

- [x] 1.1 Derive the Today-only child index and attach eligible children when building the ordinary day groups. Cover undated and future scheduling fields, a later due with a reached deadline or start, Later versus Someday, Earlier, visibility filters, manual sibling order, collapse, and a nested parent that qualifies for Today. Verify with `npm test -- listGroups` in `web/`.
- [x] 1.2 Keep Upcoming with Start with Today and the flat Today view on their existing membership rules. Exercise Today grouped by Time of day and Project, an independently due grandchild of a contextual child, and transitions from contextual to regular or absent after rescheduling, completion and reparenting. Verify with `npm test -- listGroups closedListToday` and assertions for one row per eligible task.

## 2. Row rendering and actions

- [x] 2.1 Carry the presentation state to the existing row and its equality checks. Render a muted title and its own future date in One line and Detailed, with keyboard focus, tree depth and the contextual description. Verify with a Today integration test and a `taskList.stories.tsx` story in light and dark at desktop and narrow widths. Run the UI accessibility and visual checks on both new stories and collect their baselines in the pinned Playwright environment.
- [x] 2.2 Keep opening, editing and completion on the normal row path, and filter context out of group and Today counts, time totals, all bulk-selection paths, bulk rescheduling and manual ranks. Verify with Today integration tests for normal actions, permission behavior, Select all and range selection, bulk dates and the slot/count invariants, plus `npm test -- closedListToday viewProjectDrops listDisplay`.
- [x] 2.3 Verify tree rendering and row identity at scale with `npm run test:perf -- listPerformance`. Verify count and slot tests with the limit on and off, including completing a contextual child while a regular task waits for a slot.

## 3. Explicit Today drag destinations

- [x] 3.1 Enable conditional context dragging and preserve existing group and row-drop handling for regular tasks. Verify reparenting within a project and across editable projects in the same sharing scope, undated and future-dated rows, cycle and permission rejection, and the absence of gap placement and contextual drop anchors with `npm test -- viewProjectDrops viewOrderMove`.
- [x] 3.2 Add the visible **Make top-level for today** target and equivalent keyboard-accessible row actions for both moves. Verify date and zone retention for reparenting, explicit scheduling on the logical day for promotions, a full Today limit, ordinary heading behavior, and one Undo restoring the original task and placement with `npm test -- viewProjectDrops viewOrderMove closedListToday`. Verify focus in the new stories, labelled drop feedback in the local demo, and all strings with the locale checks.

## 4. Docs and checks

- [x] 4.1 Update the built-in view guide and the closed-list guide, and prepare one changelog fragment and a ROADMAP entry for #1404. Verify with `make docs` and `make docs-check`. Keep the README's overview aligned if the user-visible feature list needs an update.
- [x] 4.2 Run `npm test` and `npm run build` in `web/`, `make bundle-budget` with the existing limits, and `make check` before marking the last implementation task done. Validate the active change and the merged specifications after archiving with `make openspec-validate`.
