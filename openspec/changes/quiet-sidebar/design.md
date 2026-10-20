# Design

## Context

See proposal.md for motivation. The sidebar today is `web/src/app/Sidebar.tsx` (627 lines, near the file limit) over the primitives in `web/src/ui/patterns/Sidebar.tsx` (`SidebarItem`, `SidebarGroup`, `SidebarGroupAction`, `useScrollEdges`). The facts that shape the approach:

- `SidebarItem` renders `count` as `<span data-count>` after the badge; it has no accessible phrase for it. Project rows pass `count={counts.byProject.get(id)}`; filter rows pass the evaluated count and an error mark (`ReadAs` with the message); `LabelRow` in `web/src/app/LabelsView.tsx` renders its own count through `ReadAs` ("3 open tasks") and is reused by the labels overview, where the number must stay visible.
- Group state is `ot.sidebar.group.<id>` in `localStorage`, read by `readOpen(key, fallback)` with `fallback = true` for Filters, Projects and Labels; `sidebar-favourites` D5 changes the fallback of Labels and Filters to `false`, which this change relies on and repeats.
- The rhythm marker is `reviewMarker()` in `Sidebar.tsx`: `Badge hue="orange"` "Due" with an sr-only sentence on the Review entry, `Badge hue="orange"` "Review due" on the More row (`data-review-due-more`), and `reviewAgo()` as faint text (`data-review-ago`) when nothing is due. The More menu already shows the Review item's `note` as its description.
- `NotificationBell` (`web/src/app/NotificationBell.tsx`) renders a red pill (`bg-danger`) with the unread number at all sizes, `aria-label` "Notifications, {n} unread", and `data-notifications` / `data-unread` hooks used by `scripts/e2e-layout.mjs` and `notificationBell.test.tsx`. `UnreadBadge` in `Sidebar.tsx` (Updates and shared projects) is already an accent pill with a `ReadAs` phrase.
- `SidebarFooter` renders Help (row or icon), the bell, the assistant launcher, the cheat-sheet button, `SyncStatus`, the collapse control, then an account `SidebarItem` with an initials circle and a settings glyph, with hooks `data-sidebar-footer`, `data-footer-row`, `data-footer-icons`, `data-help-button`, `data-shortcuts-button`, `data-sidebar-collapse` read by `sidebar.test.tsx`.
- `Shell.tsx` owns `onLogout`, `showHelp` (the cheat sheet) and the palette; it passes `onShortcuts` and `onAssistant` to the sidebar. `SessionPanel` in `AccountSettings.tsx` owns the "Sign out of this device?" `ConfirmDialog`.
- The shortcut registry already has `go.settings` (`g s`), `go.help` (`g ?`), `global.help` (`?`) and `global.assistant` (`Shift+I`); the palette already lists "Open Help" and "Keyboard shortcuts". No new shortcut is needed.
- `.hover-reveal` in `web/src/index.css` (`@layer components`) reveals an element on `.group:hover`, focus-visible and focus-within; `pointer-fine:` / `pointer-coarse:` variants exist. The design-system "assistive-tech-semantics" requirement wants hidden text inside the element, not `aria-label` on a span. `Avatar` (`web/src/ui/Avatar.tsx`) gives initials on a hue derived from the account id.
- `scripts/e2e-views.mjs` reads filter counts from the rows' `textContent` ("Work tomorrow4") and compares two devices' sidebars by text. Visual baselines for `Screens/Sidebar` and `UI/Patterns/Sidebar` live in `web/src/ui/__screenshots__/`; `make ui-check` runs axe and the screenshots.

Constraints: no new dependency, tokens only (no raw colours), function and file size limits (`internal/codesize`), the i18n catalogs (`make i18n-check` fails on a source string without entries), every new string in the six catalogs, nothing written for presentation.

## Goals / Non-Goals

**Goals:**
- Two visible numbers at rest (Inbox, Today) plus folded headers; every other count reachable by hover, focus or a screen reader.
- One marker language (an accent dot) for "something is due" and "something arrived".
- A footer of one row that keeps every control reachable in at most two steps and keeps the existing test hooks where tests and scripts read them.
- `Sidebar.tsx` under 1,100 lines after the change, which means moving the footer out.

**Non-Goals:**
- A new preference ("show counts"), a new shortcut, or changes to what the counts mean.
- Changes to the labels and filters overview pages, the page headers, the notifications list, or the phone tab bar.
- Replacing the `activity-feed` unread badges.

## Decisions

### D1. The count rule lives in `SidebarItem`, as a `countMode`
`SidebarItem` gains `countMode?: 'always' | 'hover' | 'hidden'` (default `'always'`, so Inbox, Today and the pattern stories are unchanged) and `countLabel?: string`. With a count it renders `<span data-count data-open-count={count} class="...">{count}</span>` followed by `<ReadAs>`-style hidden text from `countLabel` (the row's accessible name becomes "Website launch, 5 open tasks"). In `hover` mode the number gets the class `ui-count-quiet`; in `hidden` mode it gets `sr-only` and the hidden text alone remains. One rule in `@layer components`: `.ui-count-quiet { opacity: 0 } .pointer-coarse .ui-count-quiet, [data-sidebar-item]:hover .ui-count-quiet, [data-sidebar-item]:focus-visible .ui-count-quiet { opacity: 1 }`, written with the existing `pointer-coarse:` variant rather than a class. Opacity, not display, so the number keeps its width and the row never shifts, and the hidden text is always in the accessibility tree. `data-open-count` is present whatever the mode, which gives the end-to-end script and the tests one hook that does not depend on visibility.

*Alternative:* keep `count` as is and reveal with the existing `.hover-reveal` on a `.group` wrapper. Rejected: `.hover-reveal` is tied to `.group` and the label rows already use it for their menu; the project `li` would need to become a `.group`, and the rule would not know about coarse pointers.

### D2. Projects: hover; filters and labels: hidden
Project rows use `countMode="hover"` with `countLabel` "{n} open tasks" (plus the existing `aria-description` "Open tasks including sub-projects" when rolled up). Filter rows use `hidden` with the same phrase; the error mark (`!` with `ReadAs`) stays as the `badge`. `LabelRow` gets a `quiet` prop: the sidebar passes `quiet`, which renders its count with `sr-only`; the overview keeps the visible number. Favourite rows (when `sidebar-favourites` lands) pass the mode of their kind.

Why hover for projects and hidden for the other two: a project's count is what the person plans with (how much is in "Website launch"); a filter's count is a query result that changes with the day and the query, a label's count is usage, and both have an overview page and a page header that show the number. Hidden rather than hover for those two also means the evaluated filter counts no longer need to be visually current for every pinned view on every keystroke, though the evaluation itself is unchanged in this change (it feeds the accessible names).

*Alternative:* hover for all three. Rejected: three groups of numbers that appear and disappear as the pointer passes is more motion, not less noise, and the brief's point is that those numbers are not actionable.

### D3. Group defaults
`readOpen(groupKey('labels'), false)` and `readOpen(groupKey('filters'), false)`; Projects stays `true`. A stored `'1'` or `'0'` wins, so existing devices do not change. This is the same fallback `sidebar-favourites` D5 specifies; whichever change lands second finds the line already in place. Empty groups stay hidden by the existing `filtersShown` / `labelsShown` conditions; the headers keep `count={views.length}` / `count={labels.length}` while folded.

### D4. One `Dot` for state, with the text in two places
A small `StatusDot` in `web/src/ui/patterns/Sidebar.tsx`: `<span data-dot class="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden>` beside hidden text with the meaning (the `ReadAs` pattern), so the text is part of the row's accessible name. `reviewMarker()` returns `{ due, text, marker }` where `text` is "Review due · last weekly review 9 days ago; the Monthly look is due" (or "Last review 3 days ago" when nothing is due) and `marker` is the dot (or nothing). The Review `SidebarItem` (primary in `first` mode, inline More group on touch) is wrapped in `Tooltip label={text}`; `SidebarItem` forwards its ref, so `Tooltip` attaches to the button as it already does in the icon rail. The More row is a `Menu` trigger, so the `Tooltip` wraps the dot's own span inside the trigger (hover shows it; keyboard users get the text from the row's name), and the Review `MenuItem` keeps `description={text}`. `Badge hue="orange"` leaves the sidebar; `data-review-due` and `data-review-due-more` stay as hooks on the dot wrappers, `data-review-ago` goes (the text is in the tooltip).

The bell: `unread === 1` renders the dot at the icon's corner; `unread > 1` renders the number in `bg-accent text-on-accent` (the same classes as `UnreadBadge`); `aria-label` unchanged. `bg-danger` leaves the bell. `data-unread` stays on whichever element renders, with `data-unread={unread}`.

*Alternative:* keep the orange badge but smaller. Rejected: the brief and the audit's H3 are explicit that badges are out of the chrome, and `warning`/`orange` is the "attention" colour on cards (the Loop home uses it for due rhythms, which is where a sentence belongs).

### D5. The footer is one row with an account menu, in its own file
`SidebarFooter` moves to `web/src/app/SidebarFooter.tsx` (keeps `Sidebar.tsx` well under the file limit and lets the footer have its own test). The row: `Menu kind="menu"` whose trigger is the account control (`Avatar size="sm"` plus the name, `min-w-0 flex-1 truncate`, `aria-current="page"` while Settings, Import or Help is open, `data-account-menu`), then `IconButton`s: the assistant launcher (`data-assistant-launcher`, when `onAssistant`), `NotificationBell`, `SyncStatus`, and the collapse control (`hidden lg:inline-flex`, `data-sidebar-collapse`). Menu items: Settings (`keysOf('go.settings')`), Help (`keysOf('go.help')`, `data-help-button`), Keyboard shortcuts (`keysOf('global.help')`, `data-shortcuts-button`), separator, Sign out (`danger`, icon `log-out`). Below 768 px the same row renders with `touch-target` sizes (the existing `pointer-coarse` rules give 44 px); the full-width Help row goes. In the icon rail (`collapsed`) the row becomes a column: avatar only (the name in the tooltip), bell, sync, search, collapse, as today.

The `Menu` primitive already handles the menu role, Escape, focus return and `namedByContent`, so the account control is announced by the person's name; the items' shortcuts are announced as descriptions. The initials circle (`bg-accent`) becomes `Avatar`, which the members list and comments already use, so the same person has the same colour everywhere.

Sign out: `Sidebar` gains `onSignOut?: () => void`; `Shell` passes a handler that opens the same `ConfirmDialog` as `SessionPanel` (the dialog and its copy move to a small `SignOutDialog` in `AccountSettings.tsx` used by both), so the web-app and settings-navigation sign-out scenarios hold from either place. Online-only behaviour is unchanged: the dialog uploads pending changes when online, then clears the local copy.

*Alternative:* keep Help as an icon in the row and move only Keyboard shortcuts into the menu. Rejected: the row at 15 rem has 216 px for the name and up to four 32 px icons; one more icon costs the name its last readable characters, and Help is already one keystroke (`g ?`) and one action on every page header away.

### D6. Width budget of the row
At the sidebar's minimum (15 rem, 24 px of padding): avatar 24 px, gap, name `flex-1 min-w-0 truncate`, then at most four 32 px buttons with 2 px gaps (136 px) from 1024 px, three (102 px) between 768 and 1023 px. The name keeps at least 48 px on a desktop, which is enough for an ellipsis and two or three letters; the full name is in the control's tooltip and accessible name. On a 256 px phone drawer with 44 px targets: three or four targets (132 to 176 px) leave 56 to 100 px for the name.

### D7. Stories, baselines and hooks
`Screens/Sidebar` keeps Default, ProjectSelected, FoldedAndScrolled, Collapsed and PhoneDrawer (new baselines: no numbers on filters and labels, folded Labels and Filters, one footer row) and adds `Markers` (seeded review row 9 days old, one unread notification; shows the two dots) and `CountOnFocus` (a project row focused through `autoFocus`, which Chromium treats as keyboard focus at load, so the count is visible). `UI/Patterns/Sidebar` adds a hover-mode and a hidden-mode item. Stories are seeded through the existing fixtures; the clock is frozen so the baselines do not move. Hooks kept for tests and scripts: `data-sidebar-footer`, `data-footer-icons`, `data-help-button` and `data-shortcuts-button` (now on menu items), `data-notifications`, `data-unread`, `data-review-due`, `data-review-due-more`, `data-sidebar-collapse`, `data-count`; added: `data-open-count`, `data-account-menu`, `data-dot`.

### D8. Interface budget
Primary destinations: unchanged (four; six in Open Loops first; `budget.test.tsx` unchanged). Chrome rows above a list: unchanged (the sidebar is not a list page). Task properties: unchanged. Scroll regions: unchanged (the account menu is an overlay). Shortcuts: none added; the menu items print `g s`, `g ?` and `?` from the registry, and the cheat sheet and `docs/keyboard.md` are unchanged.

### D9. Strings
New source strings: "{n, plural, one {# open task} other {# open tasks}}" already exists (`LabelsView.tsx`) and is reused for projects and filters; new are "Review due", "Last review {ago}", "Review due · last weekly review {ago}", "Account menu for {name}" (the trigger's name when the rail hides the text), "Sign out" (exists), "Help" (exists), "Keyboard shortcuts" (exists), "Settings" (exists). Each new string is added to `de`, `es`, `fr`, `it` and `pt` with its plural forms where needed, so `make i18n-check` stays green.

## Data model

No change. Reads: the open tasks, projects, labels, views, memberships, the review row and the user preferences the sidebar already observes; the notifications cache. Writes: none for anything in this change. The per-device group state (`ot.sidebar.group.<id>`) keeps its keys and values; only the fallback for two keys changes.

## Size and resources

No dependency. Client: about +0.3 KB gzipped (the account `Menu` markup and the tooltip texts, minus the `Badge` on the More row, two `IconButton`s and the settings glyph; `Menu`, `Tooltip` and `Avatar` are already in the bundle). CSS: one rule. Binary, container image and runtime memory unchanged. The sidebar computes nothing new: the same counts feed the hidden text that fed the visible numbers.

## Risks / Trade-offs

- [People who glanced at label and filter counts lose them at rest] → the numbers are one hover, one Tab or one page away (the overviews and the page headers), and the Help pages for labels and saved views say where they went; a "show counts" preference is not added now and can be a later change if feedback asks for it.
- [Hover-only counts are invisible on touch] → `pointer-coarse` keeps them always visible on touch screens, which is the 0.7.2 behaviour there.
- [The account menu hides Help one step deeper] → `g ?`, the page header's Help action, the palette's "Open Help" and the cheat sheet's link remain; `documentation` "Help view" still names the sidebar footer as a way in, which the menu is.
- [Tests and scripts that find Help or Keyboard shortcuts as footer buttons] → the hooks move onto the menu items; `sidebar.test.tsx` opens the menu first, and `scripts/e2e-layout.mjs` only uses `[data-notifications]`, which stays.
- [`scripts/e2e-views.mjs` compares sidebars by `textContent`, which now includes the hidden phrase] → it reads `data-open-count` instead, on both devices, so the convergence assertion keeps its meaning.
- [Programmatic focus in the `CountOnFocus` story may not count as focus-visible in every browser] → the reveal rule also matches `:focus-within` on the row's `li`, and the baseline is generated in Chromium only (`make ui-check`).
- [A long translation of "Review due · last weekly review {ago}" in the More menu description] → the description wraps inside the 16 rem menu; it is one line in the six shipped languages at the default size.
- [`sidebar-favourites` and this change edit the same functions] → the overlap is the two fallback lines and the group order; whichever lands second rebases on a small diff, and the proposals say which archives first.

## Migration Plan

Pure UI; ships with the web bundle. No data migration. Rollback is a revert of the commit; the per-device group state is untouched either way (a device that stored a state keeps it; one that did not gets the previous defaults back). Docs screenshots of the sidebar and the bell are regenerated with `make docs-screenshots`.

## Implementation notes

- **Built on `sidebar-favourites` (3cbaa42).** Labels and Filters already start folded there (D3 was in place); this change adds the count rule to the Favourites rows too (`FavouritesGroup` takes `projectCountMode`; label and filter favourites use `hidden`). `openTasksLabel(n)` in `web/src/app/Sidebar.tsx` gives every row its "{n} open tasks" phrase.
- **Counts.** `SidebarItem` (`web/src/ui/patterns/Sidebar.tsx`) has `countMode` and `countLabel`; the visible number is `aria-hidden` when a phrase is given and the phrase is hidden text (", 5 open tasks"), so the name reads "Website launch, 5 open tasks". Inbox and Today carry the phrase as well. A coarse pointer is detected in the sidebar with `useMediaQuery('(pointer: coarse)')` and turns project rows to `always` (testable in happy-dom); `.ui-count-quiet` in `web/src/index.css` hides the number only under `@media (hover: hover)` and reveals it on `:hover` and `:focus-within` of the row (`.group` or `[data-sidebar-item]`). `LabelRow` has `quiet` (the sidebar's rows: hidden text only); the labels overview keeps the visible number. `data-open-count` is on the count of `SidebarItem` and of `LabelRow`.
- **Marker text.** `reviewMarker()` returns `{ due, text, marker }`. Due: "Review due · {details}", the details joined by "; " from "last weekly review {ago}" (or "no weekly review yet" when there never was one, which the spec does not word), "the Monthly look is due" and "the Daily check is due". Not due: "Last review {ago}", which is the Review entry's tooltip and `aria-description` and the More menu item's description. `StatusDot` puts the text in the row's name. The More row's dot is wrapped in `Tooltip`; the Review entry is wrapped in `Tooltip` by `item()` (its `tip` argument). With nothing due the Review entry has no badge, so with "Show shortcut hints" on it now prints its `g r` hint like the other destinations.
- **Primitives.** `Menu` (`web/src/ui/overlay/Menu.tsx`) gained `triggerProps` (for `aria-current` and `data-account-menu`) and `tip`/`tipSide` (a tooltip on the trigger: the full name, also in the icon rail); `MenuItem` passes `data-*` hooks through (`data-help-button`, `data-shortcuts-button`, `data-settings-button`, `data-sign-out-button`).
- **Footer.** `web/src/app/SidebarFooter.tsx` replaces the old footer function; the old `data-footer-row` hook is kept on the outer element, `data-footer-icons` on the row. Sign out opens `SignOutDialog` (exported from `AccountSettings.tsx`, also used by `SessionPanel`) one tick after the menu closed, so the menu has returned focus to the account control and Escape on the dialog lands there. `Shell` passes `onSignOut={onLogout}`. Below 768 px the row's controls get `max-md:min-h-11 max-md:min-w-11` plus `touch-target`.
- **Bell.** `data-unread` carries the number on the mark (`data-unread="1"` on the dot, which also has `data-dot`); the mark is `aria-hidden`, the button's name states the number.
- **Tests outside the named files.** `deadlineViews.test.tsx`, `somedayViews.test.tsx`, `uiCorrectness.test.tsx` and `review/review.test.tsx` read the Inbox/Today count from `[data-count]` (the row's text now ends with the phrase) and the review marker from the dot and the description.
- **e2e.** `scripts/e2e-views.mjs` reads a filter row as its name plus `data-open-count`; it also opens the Filters group on each new browser context (an init script setting `ot.sidebar.group.filters`), since the group starts folded on a new device since `sidebar-favourites`.
- **Strings.** New: "Account menu for {name}", "Review due · {details}", "last weekly review {ago}", "no weekly review yet", "Last review {ago}"; "Review due" (alone) and "the last weekly review was {ago}" are no longer used and left the catalogs.
- **Not regenerated here.** Visual baselines need a Docker daemon (`make ui-baselines`); they come from CI's ui-check-report artifact (changed: every `screens-sidebar--*` story and `ui-patterns-sidebar--structure`; new: `screens-sidebar--markers`, `screens-sidebar--count-on-focus`, `screens-sidebar--account-menu`, `ui-patterns-sidebar--count-modes`). axe passes on all of them in light and dark (`scripts/ui-check/a11y.mjs` with the bundled Chromium). Docs screenshots were not regenerated (`make docs-screenshots` fails on about 30 shots for unrelated reasons); `docs/images/sidebar-*.webp` and `docs/images/notifications-*.webp` are stale (numbers on filters and labels, the old footer, the red bell count).
- **Layout check.** `scripts/e2e-layout.mjs` opened the cheat sheet from the footer's Keyboard shortcuts button; it now opens it through the account menu, and `checkOverlay` takes an optional `reopen` step for overlays that are not opened by one click on their trigger (focus still has to return to the account control). `ENGINES=chromium make layout-check` passes with it (the reminder toast timed out once in a full run and passed on a rerun; it does not involve the sidebar).
- **e2e.** `make e2e` stops in `scripts/e2e-smoke.mjs`, before this change's script, because the start guide from `lean-chrome` adds a second "Add a task" field (a strict-mode locator); that is not this change's. `scripts/e2e-views.mjs`, run on its own against a fresh data directory, passes; its unpin step now follows `sidebar-favourites` ("Pin to sidebar", the filter leaves Favourites and stays in Filters).
