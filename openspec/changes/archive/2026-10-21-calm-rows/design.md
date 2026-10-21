# Design

## Context

See proposal.md for motivation. The row is one memoized component, `web/src/app/TaskRow.tsx` (292 lines; the board card is the same component with `card`), fed by `web/src/app/task-list/ListRow.tsx` from `rowRenderer` in `task-list/ListGroups.tsx`, and directly by `FilterView`, `SavedViewView`, `DashboardView`, `method/MethodListView`, the review screens and `display/DisplayColumn`. It builds its metadata line from the three chip primitives in `web/src/ui/Chips.tsx` (`ToneText`, `LabelChip`, `NeutralChip`, each with `ReadAs` for the spoken phrase) and knows about its view only through `showProject`, which `rowRenderer` sets to false for `project`, `label` and `inbox`. Groups come from the pure `listGroups()` in `web/src/lib/listGroups.ts` (keys `overdue`, `today`, `evening`, `blocked`, a date for Upcoming, `section:<id>`, `later`), tested in `listGroups.test.ts`.

The appearance preferences (`web/src/lib/appearance.ts`) are one `user_prefs` row with the entity id `me`, written with `mutate()` and read through the shared live read `useUserPrefsRow()` (`web/src/lib/localData`); `density` was added the same way by `ux-overhaul` (`internal/sync/ops.go` `Schema["user_prefs"]`, `web/src/lib/types.ts`, `USER_PREFS_DEFAULTS` in `ops.ts`, `readAppearance`, the `Segmented` control in `AppearanceSection.tsx`, `density.test.tsx`). Density is synced, not device-local, and the `appearance-preferences` spec says there is no per-device override.

Constraints: tokens only (`src/ui/tokens/lint.test.ts`), every foreground/background pair in `src/ui/tokens/pairs.ts` (`contrast.test.ts`), no `aria-label` on a role-less span (`a11y/no-generic-aria-label`), 44 px targets on coarse pointers, rows re-render only when a prop changes (`listPerformance.test.tsx`), the vendored icon set (`repeat` and `hourglass` are already vendored and used), stories with baselines for the core screens (`taskRow.stories.tsx`, `board.stories.tsx`, PNGs under `web/src/ui/__screenshots__/`), strings through `t()`/`msg()` with the five translated catalogs under `web/src/locales/` (`make i18n-check`).

## Goals / Non-Goals

**Goals:**
- One row component, one more input (the detail) and two small facts about its place (what the heading implies, which label's view it is in); every other caller keeps working unchanged in Detailed and gets Calm for free.
- The omission logic is pure data computed where the groups are built, so the same unit tests that pin grouping pin what a heading implies.
- Both details have stories and baselines; the Calm row is the default in tests, stories and the demo.

**Non-Goals:**
- No change to the panel's chips, the sidebar, the board column layout, the `label` view's project chip, the Today heading, or the row's handlers.
- No per-view or per-device override of the detail; no third mode.
- No new primitive beyond one label chip variant; no new token, icon or pair.

## Decisions

**D1. A synced preference, not a device setting.** `row_detail` joins `density` in the `user_prefs` row: `kString` in `internal/sync/ops.go`, `row_detail: string` in `UserPrefs` (`types.ts`), `row_detail: ''` in `USER_PREFS_DEFAULTS`, `detail: 'calm' | 'detailed'` in `Appearance` with `readAppearance` mapping anything but `'detailed'` to `'calm'`, and `setAppearance('row_detail', value)`. The proposal brief asked for a device-local choice "consistent with density"; density is synced, so consistency means synced, and the `appearance-preferences` spec forbids per-device overrides of appearance. Alternative: `localStorage` like Vim keybindings or "Show completed tasks". Rejected: a user who chose Detailed on the laptop would meet Calm again on the phone, and the Appearance section would hold one row that does not follow the account while its sentence says all of them do.

**D2. The row reads the detail itself.** `useRowDetail()` in `web/src/lib/appearance.ts` returns `readAppearance(useUserPrefsRow()).detail` (one shared live read, so 2,000 rows subscribe to one store and re-render only when the value changes, as for comment counts). `TaskRow` takes an optional `detail` prop that overrides the hook, for stories and unit tests; no caller in the app passes it. Alternative: thread it through `RowContext` and every direct caller. Rejected: eight call sites for one value that never varies within a screen.

**D3. What a heading implies is data on the row.** `ListRow` (in `lib/listGroups.ts`) gains `implied?: { date?: true; evening?: true; someday?: true }`, set by `listGroups()`: `{date}` for Today's `today` group and each Upcoming date group, `{date, evening}` for the `evening` group, `{someday}` for every group of the Someday view; nothing for Overdue, Blocked, Later, sections, the tree and the board. `rowRenderer` passes `implied={r.implied}` and `omitLabel={c.view === 'label' ? c.labelId : undefined}` (`RowContext` gains `labelId`, the route id). Direct callers pass nothing and get the full Calm row. The table in the spec is this function plus `showProject`; the unit test in `listGroups.test.ts` asserts the flags group by group.

**D4. The date splits into words and time.** `describeDue()` in `lib/dates.ts` additionally returns `time` (the formatted time or `null`), leaving `label` as it is for every other caller. In Calm, `TaskRow` shows `label` unless `implied.date`, then `time` alone (or nothing); the evening suffix is dropped under `implied.evening`; the repeat mark leaves `dateText()` and becomes `<ToneText tone="muted" icon="repeat" data-recurring>` after the date (icon with the word, never icon-only, 12 px as every chip icon). Tone: `DUE_TONE_CALM = { overdue: 'danger', today: time ? 'accent' : 'muted', soon: 'muted', later: 'muted' }`; Detailed keeps `DUE_TONE`. The deadline keeps `DEADLINE_TONE` (the deadlines spec sets those tones); only its icon stops inheriting a colour that was never specified. `accent-text` on `canvas`, `surface` and `raised` is already in `pairs.ts`, so no new pair.

**D5. Neutral ring for P3 and P4.** `PRIORITY_RING_CALM = { 1: 'border-p1 bg-p1-soft', 2: 'border-p2 bg-p2-soft', 3: 'border-input', 4: 'border-input' }`; `border-input` is already a 3:1 UI pair on `canvas`, `surface` and `sunken`. The panel's priority chip is untouched (out of scope), so the panel still names P3 as "Medium" in blue; the row simply stops shouting it.

**D6. Label dots are one chip variant.** `LabelDots({ labels, omit })` in `web/src/ui/Chips.tsx`, beside `LabelChip`: a `span` with `role="group"` and `data-label-dots`, holding one 6 px dot per label (`style={{ backgroundColor }}` as `LabelChip` does: stored colours are allowed), the first name in `text-muted`, and `+n` when more than one. The spoken phrase ("Labels: errand, call, home") is `ReadAs` text inside the group; when `n > 0` the group gets `tabIndex={0}` and is wrapped in `Tooltip` with the full list, so hover and keyboard focus show every name. The tab stop exists only on rows with two or more labels and does not touch the `j`/`k` cursor, which focuses the open control. Alternatives: (a) show all names and drop the dots: no shorter than today; (b) tooltip on hover only, names only in the panel: the brief asks for focus too and a hover-only tooltip fails the keyboard-first rule; (c) make the whole open button carry the tooltip: it would describe the task's open control with its labels for every row, which is noisy for screen readers. `Chips.stories.tsx` and `Chips.test.tsx` get the variant.

**D7. The trailing group is a sibling of the open button.** After the open `button` in the `li`: `<span data-row-counts className="ml-auto mt-0.5 flex shrink-0 items-center gap-2 text-meta tabular-nums text-faint transition-colors duration-(--duration-ui) group-hover:text-muted group-focus-within:text-muted">` with the four markers as today's `NeutralChip`s minus the fill (plain text and 12 px icons, the same `ReadAs` labels). `faint` on every surface is a 4.5:1 text pair, so "low contrast" is still AA and the group is never hidden, never `aria-hidden`, never a control. On a card (`card`), the group sits at the end of the metadata line with the same classes, so the card's shape does not change. In Detailed the group is not rendered and the chips stay in the line. The `hasMeta` test no longer counts the four markers, so a Calm row with only counts is one line tall with the counts on that line.

**D8. The Appearance control.** A `SettingRow id="appearance-rows"` after Density: label "Rows", description "Calm leaves out what the view already says, colours only what needs attention and keeps counts quiet until you hover. Detailed shows every chip.", control `Segmented` with `['calm', 'detailed']`, `testId="appearance-rows"`, wired like `onDensity`. `settingsIndex.ts` gets the row so settings search finds "Calm". No shortcut (none asked for; `v` is the project layout, `Shift+V` dictation in `web/src/lib/shortcuts.ts`).

**D9. Stories and baselines.** `taskRow.stories.tsx` gains `CalmToday` (the demo's row set: timed, overdue, evening, repeating, three labels, counts, a P3) and `DetailedToday` (the same rows with `detail="detailed"`), each in a Today-like list with an `implied` row and a project row, plus `CalmLabels` (one, two and four labels, one omitted); existing stories render Calm by default so their baselines are regenerated once with `make ui-baselines`. `board.stories.tsx` gains one Calm column. Light/dark × 375/1280 and the axe gate run as for every story.

**D10. Stories and tests default to Calm.** `taskRow.test.tsx`'s "Today · evening · repeats" case becomes two cases (Calm: no date text, a repeat icon with the word; Detailed: the old assertion with `detail="detailed"`); the timed-today case asserts `text-accent`; new cases cover P3's neutral ring, the dots and "+2", the omitted label, the counts group's classes and spoken text, and `implied.date` in Today. `density.test.tsx` gets a sibling `rowDetail.test.tsx` (preference read, unknown value, one op, the control, the live switch). `budget.test.tsx` gets `MAX_CALM_ROW_ITEMS = 4`: the seeded Today row with a time, an estimate, a project, three labels, subtasks and comments shows at most four full-contrast metadata items.

## Data model

Additive only: `user_prefs.row_detail` (string; `''`, `calm` or `detailed`; absent and unknown read as `calm`) in the op schema, the TypeScript type and the client defaults. Not a content field (an enumeration, never user text), so not in `e2ee.ContentFields` or `CONTENT_FIELDS`. No field renamed or removed; older clients store and forward it unchanged, as for `density`. The rows themselves write nothing: `implied`, the detail and the omissions are computed at render time from local data.

## Size and resources

No dependency. Web bundle about +1.2 KB gzipped (`LabelDots`, the trailing group, the Calm tone tables, `implied` in `listGroups`, one settings row and its strings). Go binary: one schema entry, no measurable change; container image and runtime memory unchanged. Rendering cost: one extra shared-store subscription per row (as `useCommentCount`) and a few more conditionals; `listPerformance.test.tsx` keeps asserting that a cursor move re-renders two rows.

## Interface budget

- Rows of chrome above the first item: unchanged (header, quick add).
- Task properties visible by default: in Calm the demo's Today row drops from seven items (circle colour, date, estimate, subtasks, comments, labels, project) to at most four at full contrast (time, estimate, label dots with one name, project), with the counts quiet; a row never shows more than before in either detail. `budget.test.tsx` pins the four.
- Primary sidebar destinations: unchanged.
- Vertical scroll regions: unchanged.
- Shortcuts: none added.

## Risks / Trade-offs

- [Existing users see a quieter row after the update, not only new devices] → the default applies to every account without a stored value; writing `detailed` for accounts whose `first_run` is done would be a client write nobody asked for. The CHANGELOG and `docs/settings-you.md` say where Detailed is, one click away.
- [A tester or a doc reads "Today 10:00" and finds "10:00"] → the docs screenshot of Today is regenerated (`make docs-screenshots`, the `today` shot) and `docs/today-and-upcoming.md` says the time stands alone under Today.
- [Hover has no meaning on touch] → the counts stay at faint (4.5:1) contrast; nothing is hidden, nothing needs a tap.
- [The faint counts fail an accessibility audit for "low contrast"] → `faint` × every surface is already a 4.5:1 text pair measured by `contrast.test.ts` in both modes; the axe gate runs on the new stories.
- [A row with only comments becomes one line with the count at the end, which moves nothing but looks new] → covered by a story; the row's height rules (`row-pad`, density) are unchanged.
- [`describeDue` gains a field] → additive; its callers (`TaskRow`, the panel's Do on chip, the CLI's Go port is separate) ignore it; `dates.test.ts` adds the time case.
- [Translations lengthen "Calm" / "Detailed" past the segmented control's width] → checked with the workbench language switch on the Appearance story; the control already holds "Comfortable".
- [The tab stop on multi-label rows surprises keyboard users] → it exists only when names are hidden, is announced as the labels group, and `Esc` closes the tooltip; recorded in the keyboard page if the wording needs it.

## Migration Plan

Pure client plus one additive schema line. Ships with the next build; no data migration. Rollback is reverting the commit: a stored `row_detail` is then an unknown field that older clients keep and ignore, as the schema rules require. Docs screenshots (`today`, `project-list`) are regenerated.

## Implementation notes

- **`implied.date` carries the day, not `true`.** `RowImplied` is `{ date?: string; evening?: true; someday?: true }` in `web/src/lib/listGroups.ts`: `date` is the local day the heading names (Today's `today` and `evening` groups, each Upcoming date group). A Calm row drops the date words only when its own due falls on that day, so a task listed under a heading for another reason (an Upcoming group keyed by a deadline, a task in Today because of its start date or deadline) keeps its date. This keeps "a row never omits a value because of what it is" true by construction. `withImplied()` sets it per group; a new fact a heading can imply is one more field.
- **Counts are one list.** `rowCounts()` in `TaskRow.tsx` returns the counts (progress, notes, comments, attachments) as data; Detailed renders them as `NeutralChip`s in the line in the old order (progress, then the assignee, then notes, comments, attachments), Calm renders them in `RowCounts`, the trailing `data-row-counts` group. A later count (a tracked-time figure) is one more entry there.
- **The open button's name.** In Calm the counts group is a sibling after the open button (D7), so the button's own text is the title and the line; the counts are read as the row's next element. `assistiveSemantics.test.tsx` asserts both details.
- **Strings.** "{n} more labels: {names}" from task 1.4 is not added: the group's spoken text is "Labels: {names}" with every name (the scenario's phrase), and the tooltip shows the names joined, so a second phrase would only be read twice. The settings index adds one description string, "Calm or detailed task rows".
- **Deadline icon.** The deadline keeps `DEADLINE_TONE` for its text and icon as before; the spec only asks that it keep its hourglass and its tones, so the icon colour is unchanged.
- **Not regenerated here.** Visual baselines (task 3.5) need a Docker daemon for `make ui-baselines`, which this session does not have; the stories were built and rendered once in the bundled Chromium, and the baselines for the existing row and board stories (now Calm) and the new `CalmToday`, `DetailedToday`, `CalmLabels`, `CalmColumn` and `LabelDotsVariants` come from CI's ui-check-report artifact. Docs screenshots (task 4.3) were not regenerated: `make docs-screenshots` fails on about 30 shots for reasons unrelated to this change; `docs/images/today-*.webp`, `project-list-*.webp`, `upcoming-*.webp` and `labels-*.webp` now show Detailed-style rows and are stale.
