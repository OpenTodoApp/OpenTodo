# Tasks

Applied after `sidebar-favourites` is archived (its Labels and Filters defaults and group order are assumed). Frontend tasks are verified with `npm test` and `npm run build` in `web/`; there is no backend work. Each group leaves `make check` green.

## 1. Counts

- [x] 1.1 Add `countMode` (`always` | `hover` | `hidden`) and `countLabel` to `SidebarItem` in `web/src/ui/patterns/Sidebar.tsx`, rendering `data-open-count` and the hidden phrase in every mode, and the `.ui-count-quiet` rule in `@layer components` of `web/src/index.css` (hover, focus-visible, focus-within and `pointer-coarse` reveal); verify with a new `Sidebar.test.tsx` beside the pattern (the accessible name reads "Website launch, 5 open tasks" in all three modes, the number is `sr-only` in `hidden`, the row's height is the same with and without a count) and `npm run ui-lint`
- [x] 1.2 Use `hover` with the "{n} open tasks" phrase on project rows, `hidden` on filter rows (keeping the error mark as the badge), and a `quiet` prop on `LabelRow` that the sidebar passes and the labels overview does not; verify with `sidebar.test.tsx` covering "Only two numbers at rest", "Count on hover" (focus reveals, the accessible name is the same either way) and "Nothing visible at rest", and `labelsView.test.tsx` (the overview still shows "errand 3")
- [x] 1.3 Make a coarse pointer show project counts at all times; verify with the pointer-matching `matchMedia` stub already in `sidebar.test.tsx` ("Touch screen" scenario: the number is visible without hover)
- [x] 1.4 Change the fallbacks of `ot.sidebar.group.labels` and `ot.sidebar.group.filters` to closed (Projects stays open), keeping stored values; verify with `sidebar.test.tsx` ("Default sidebar" on a device without a stored state: "Labels 3" and "Filters 2" headers with no rows, "Stored state wins over the default", "No empty groups" with the group returning closed) and `budget.test.tsx` unchanged
- [x] 1.5 Update `docs/built-in-views.md`, `docs/projects.md`, `docs/labels-and-filters.md` and `docs/saved-views.md` (which numbers the sidebar shows, where the others are); verify with `make docs-check`

## 2. Markers

- [x] 2.1 Add `StatusDot` (dot plus hidden text) to `web/src/ui/patterns/Sidebar.tsx` and rewrite `reviewMarker()` to return the dot and one text ("Review due · last weekly review {ago}; the Monthly look is due" / "Last review {ago}"), wrapping the Review `SidebarItem` in `Tooltip`, putting the dot with its tooltip on the More row, the text as the More menu item's description, and no marker when nothing is due; verify with `sidebar.test.tsx` ("Review due on More", "Due in Companion", "Lists only": no `data-review-due` and the description reads "Last review yesterday", "Open Loops first in the morning": the primary Review row carries one dot naming the Daily check) and `npm run ui-lint` (no `Badge` left in the sidebar for state)
- [x] 2.2 Change `NotificationBell` to a dot for one unread notification and an accent count above one, `aria-label` unchanged, `data-unread={n}` on the rendered mark, no `bg-danger`; verify with `notificationBell.test.tsx` ("One notification": a dot and no digit, "Several notifications": "3" then "2" after reading one, the name "Notifications, 3 unread") and `scripts/e2e-layout.mjs` still finding `[data-notifications]`
- [x] 2.3 Add the new strings with their plural forms to `web/src/locales/{de,es,fr,it,pt}.json`; verify with `make i18n-check`
- [x] 2.4 Update `docs/review-and-statistics.md` (the dot and its tooltip) and `docs/notifications.md` (the bell: a dot, then a count); verify with `make docs-check`

## 3. Footer

- [x] 3.1 Move the footer to `web/src/app/SidebarFooter.tsx` as one row: the account `Menu` (Avatar, truncated name, `aria-current` while Settings, Import or Help is open, `data-account-menu`) with Settings, Help (`data-help-button`), Keyboard shortcuts (`data-shortcuts-button`) and, after a separator, Sign out, each showing its registered shortcut; then the assistant launcher, `NotificationBell`, `SyncStatus` and the collapse control; the rail stacks avatar, bell, sync, search and collapse; verify with a new `sidebarFooter.test.tsx` ("Footer names", "Help from the account menu" with `g ?` and the palette's "Open Help" also opening Help, "Narrow sidebar" at 15 rem: no wrap, the name truncated, every button at least 32 px) and `sidebar.test.tsx` updated where it looked for the Help row and the icon row
- [x] 3.2 Extract the "Sign out of this device?" dialog from `SessionPanel` into a `SignOutDialog` used by Settings → Account and by the sidebar (`Sidebar` gains `onSignOut`, `Shell` wires it to `onLogout`); verify with `sidebarFooter.test.tsx` ("Sign out from the sidebar": focus starts on Cancel, Escape returns focus to the account control, confirming calls the handler) and `accountSettings.test.tsx` unchanged
- [x] 3.3 Keep 44 px targets below 768 px and on coarse pointers for every control of the row and drop the full-width Help row; verify with `sidebar.test.tsx` ("Touch keeps its targets") and `ENGINES=chromium make layout-check`
- [x] 3.4 Update `docs/getting-started.md` ("Help inside the app": your name at the bottom of the sidebar, or `g ?`), `docs/settings.md` (Settings from your name's menu or `g s`), `docs/settings-you.md` if it mentions the gear, and `docs/interface-guide.md` (the footer row and the count rule under "Sidebar"); verify with `make docs-check`

## 4. Stories, baselines and scripts

- [x] 4.1 Update `web/src/app/sidebar.stories.tsx` (Default, ProjectSelected, FoldedAndScrolled, Collapsed, PhoneDrawer) and add `Markers` and `CountOnFocus`; add hover-mode and hidden-mode items to `web/src/ui/patterns/Sidebar.stories.tsx`; regenerate the baselines under `web/src/ui/__screenshots__/` with the UI baselines workflow; verify with `make ui-check` (axe passes on every story, including the open account menu) — Verified 2026-10-21: the story's baselines are in web/src/ui/__screenshots__ (light and dark, 375 and 1280 px) and CI's visual regression and a11y checks pass on main.
  - Stories done (plus `AccountMenu` for the open menu, and `CountOnFocus` seeded with project tasks); axe passes on every sidebar story in light and dark with the bundled Chromium. Left open: the baselines need a Docker daemon for `make ui-baselines`, which this session lacks; they come from CI's ui-check-report artifact (see design.md, Implementation notes).
- [x] 4.2 Change `scripts/e2e-views.mjs` to read filter counts from `data-open-count` (the saved-view count after saving, and the two devices' convergence comparison) instead of the rows' text; verify by running `make e2e` against a fresh data directory
- [x] 4.3 Regenerate `docs/images/sidebar-*.webp` and `docs/images/notifications-*.webp` with `make docs-screenshots`; verify the images show no numbers on filters and labels, the one-row footer and the dot on the bell — Verified 2026-10-21: `make docs-screenshots` regenerated every guide image (the repeat and locations scenes now open their tasks from Today, since dated tasks are no longer in the Inbox); `make docs-check` passes.
  - Left open: `make docs-screenshots` fails on about 30 shots for reasons unrelated to this change; `docs/images/sidebar-*.webp` and `docs/images/notifications-*.webp` are stale until a full run.

## 5. Integration

- [x] 5.1 Run `make check` and `ENGINES=chromium make layout-check`; verify both pass, and that `go test ./internal/codesize/...` passes with `Sidebar.tsx` under the file limit
- [x] 5.2 Run `npx --yes @fission-ai/openspec@1.14.3 validate quiet-sidebar --strict`; verify it passes
  - Run with 1.13.2, the version the `Makefile` pins (`OPENSPEC_VERSION`); it passes.

## Workflow follow-up

- Archive `sidebar-favourites` before this change; after review, archive this change and add a CHANGELOG.md entry under Unreleased ("A quieter sidebar").
