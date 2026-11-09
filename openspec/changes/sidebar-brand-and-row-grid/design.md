# Design

## Context

Observed in the code (a craft pass, so what is there matters most).

**Sidebar:**
- `Sidebar.tsx:427` renders `SidebarHeader left={<WorkspaceControl/>} rail={<InstanceMark size={24}/>}`.
- `WorkspaceMark` (`WorkspaceControl.tsx:24-32`) shows `InstanceMark` (the app's check-mark `BrandMark`, or the owner's logo) for a default workspace without an icon or colour. With one workspace the text is two lines: the wordmark over "Personal".
- About and What's new open only from Settings › About (`AboutSection.tsx`, `NewsDot` on the settings row).
- `SidebarFooter.tsx` is one row: account, assistant, bell, relay and sync, plus collapse and search on the rail.
- Workspaces carry `icon` and `color` (`types.ts:2191`). They are server-side, not ops.

**Rows:**
- `TaskRow.tsx` `FullRow` is a flex row: leading slot, checkbox, open button, trailing slot.
- The head (`:890`) is `flex items-start` with the title, `PriorityMark` (`text-meta`), the repeat `ToneText` (`shrink-0`) and `RowCounts`, so marks are top-aligned, not baseline-aligned.
- From 40 rem the props are a grid (`index.css:1272-1310`): date 5.75 rem, project 9.375 rem, a third cell of 6 to 6.875 rem (labels, else the deadline, else the progress), estimate 4 rem, assignee 1.25 rem. It is `align-items: center` against the head's `items-start`.
- Evening and the day part fold into the date text (`:77-84`).
- Below 40 rem the line is a flex-wrap.

**Task panel:**
- `TaskHead.tsx`: an h-5 checkbox beside a `text-h3` textarea.
- `ui/Tabs.tsx:79`: `overflow-x-auto` with `shrink-0 whitespace-nowrap` tabs, so "Time · 1h 20m" overflows.
- `Subtasks.tsx`: a bordered block, the heading semibold with an icon, items `text-body`.
- `EstimateField.tsx`: a `w-32` input and six `font-mono` bordered presets.

**Upcoming:** `useUpcomingList` renders each day as a `ListGroup` with every row, collapsible headers (`collapsedGroups.ts`) and no per-day limit.

## Goals / Non-Goals

**Goals:**
- Columns that line up down every list.
- One mark per thing, in its place.
- A panel that fits its width.
- An Upcoming that reads calmly when full.

**Non-Goals:**
- New row facts.
- Board cards.
- The phone row's one-cell rule.
- Merging tabs.
- Changing what any value means.

## Decisions

**D1. The workspace picture and the brand line.**
- The header's left part is `WorkspaceControl` with a 20 px picture (icon on its colour, else initial on its colour, else initial on the raised surface) and the workspace's name on one line.
- The rail shows the picture.
- `InstanceMark` and `InstanceWordmark` leave the header and move into a new `SidebarBrandLine` under the footer row: 14 px mark, the name and the version in faint metadata type, a link to Settings › About, and the `NewsDot` when What's new has unread entries.
- A branded server shows its logo and name there.

```
 ┌──────────────────────────┐
 │ [P] Personal ▾       ⌕   │   workspace picture + name
 │  Inbox              4    │
 │  Today              7    │
 │  …                       │
 │ ──────────────────────── │
 │ (A) Raffaele   ✦ 🔔  ●   │   footer row (unchanged)
 │ ✓ OpenTodo 0.22.0     •  │   brand line: quiet, opens About
 └──────────────────────────┘
```

Alternatives considered:
- Keep the mark in the header beside the workspace. Rejected: that is the confusion reported, with two pictures meaning two things in one row.
- The mark in the footer row. Rejected: that row is already full on a 256 px sidebar.

**D2. The row's slots.** From 40 rem of row width the open button is a grid with named lines:

```
 ▸ ○ 09:30  Call the plumber  ⟳ 2/3      Home renovation  [errand][call]  45m  Tomorrow  (M)
 │ │ │      └ title + marks on the baseline └ project        └ labels        └ est └ date └ assignee
 │ │ └ time column: time, else part icon (☾), else deadline countdown
 │ └ checkbox
 └ leading slot
```

- The slots are, in order, project, labels, estimate, date and assignee. The order follows the owner's direction: what the task belongs to, then how big it is, then when, with the date as the list's right edge, the column the eye scans.
- Each slot holds one kind of fact. The deadline leaves the labels slot: it is in the time column when there is no time and no part, else in the second line. The subtask progress stays in the counts beside the title, where it already is.
- The slot widths are list-level custom properties (`--slot-project`, `--slot-labels`, and so on).
- `align-items: first baseline` aligns the head and the slots on the title's first line, so a wrapped title keeps its facts on line one.
- **Empty slots keep their width (recommended)**, because a collapsing slot is exactly what makes the columns drift. A slot that no row of the list uses is 0 wide, decided from the list's rows (the same data the time column already uses), never from the rows in view, so scrolling never shifts the columns.
- Alternatives considered:
  - Collapse every empty slot. Rejected: the columns would drift.
  - Fixed widths for every slot in every list. Rejected: a list without labels would carry a hole on every row.
- Densities: the slot widths are the same in Comfortable and Compact, and only the row height changes.
- Detailed rows keep their details line (`row-layouts`) with the baseline rule for the marks. Cards keep their shape.
- Below 40 rem the metadata line is unchanged. Below 768 px the phone row's one cell is unchanged.

**D3. Marks on the baseline.** The priority mark, the repeat icon and the counts become 12 px at the metadata size, in one run after the title. The run aligns to the title's first line with the grid's `first baseline`, not to its last line, so a two-line title keeps its marks on line one, level with the slots. The repeat mark keeps its accessible name, "repeats".

**D4. The part of the day in the time column.**
- The time column holds the time, else the part's icon (`sunrise`, `sun`, `moon` from the vendored set, named "Morning", "Afternoon" or "Evening"), else the deadline countdown.
- This removes "· evening" from the date text, so the date slot always holds one kind of word.
- A heading that states the part (This Evening, Morning) leaves the icon out, as the omission table already says.

**D5. Panel proportions.**
- The title steps from `text-h3` to the `title` step in the docked panel. The task page keeps `text-h1`.
- The checkbox is 18 px, centred on the first line's box through a grid with `align-items: first baseline` plus a half-leading offset.
- Facet lines, section headings and subtask rows use a 32 px step.
- The estimate editor is one `ui-input` with ↑ and ↓ in 15-minute steps and four presets (15m, 30m, 1h, 2h) as a quiet segmented row in the interface face. The six monospace buttons and the separate clear button go, and Clear is in the facet editor's footer.

**D6. Tabs that fit, not merged (recommended).**
- `Tabs` gains a `fit` mode, measured with a `ResizeObserver` on the row:
  - when the labels do not fit, every tab becomes its icon and its count (Comments 4, Time 1h 20m), and the selected tab keeps its word if that fits;
  - otherwise every tab gets its word.
- The panel's tab row uses `fit`, while other tab rows keep `Tab rows scroll only sideways`.
- Activity and History stay two tabs. Activity is computed on the device and works offline. History is the server's operation log: online only, with versions and restore (`trash-and-history`). Merging them would put an online-only list inside an offline one and touch five requirements in three capabilities for no gain in the row's width once icons fit.
- Alternative considered: merging into Activity with an "Every change" switch. It is offered in the open questions.

**D7. A quiet subtask checklist.**
- The heading is "Subtasks" at the label size in medium weight with "2 of 5" and the progress bar, and the list icon goes.
- The items are borderless 32 px rows: a 16 px checkbox and the title in the default tone, the done ones faint with their strike.
- The task page keeps its bordered block, with the same heading and quiet items.

**D8. Calm Upcoming.**
- A display option, "Later days", with Summarised (default) or In full, stored in an additive `user_prefs.upcoming_later` (`""` or `summary` = Summarised, `full` = In full).
- With Summarised, the first three days that have tasks render in full. Each later day renders as a closed group bar:

```
 Thu 19 Nov · 6     Dentist, Pay rent, Call Ana…
```

- Bars reuse `ListGroupHeader` with a `summary` slot and the device-only collapse state of `collapsedGroups`, so an opened day stays open on that device.
- Keyboard and drop rules follow `ListGroups` as today.
- Why here and not in `focus-redesign`, and not on its own: it is a list presentation change made of the same row, group-bar and display-option pieces as the row grid, and it ships with the same baselines.
- Alternatives considered:
  - Show only N rows per day with "n more". Rejected: every day still scrolls past, so the wall stays.
  - A week summary. Rejected: Plan and Week already do that.

## Data model

- One additive field: `user_prefs.upcoming_later`, kind string, default `""`, not content. Declared in `internal/sync/ops.go` `Schema` with a comment, with `web/src/generated/opSchema.ts` and the contract fixture regenerated (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`).
- Offline: the choice is written locally first. Convergence: per-field last-writer-wins. A 1.0 client stores and forwards it untouched, and an unknown value reads as Summarised.
- Workspaces' `icon` and `color` already exist, server-side, and are unchanged.
- No field is renamed or removed.

## Interface budget

- **Rows of chrome above a list's first item:** unchanged at 2. The brand line is in the sidebar footer, and the Upcoming bars are list content.
- **Task properties visible by default:** unchanged. The row grid shows at most the same facts as today.
- **Primary sidebar destinations:** unchanged. The brand line is not a destination.
- **Scroll regions:** unchanged. The tab row stops scrolling sideways.
- **New shortcuts:** none. ↑ and ↓ in the estimate field are local to the field, and ← → on Upcoming's bars are the existing group keys.

## Size

- No dependency. The image size and runtime memory are unchanged.
- The first load gains under 2 KB gzip (grid CSS, the picture and the brand line). The budget's headroom is small, so the implementation measures it and raises `web/bundle-budget.json` on purpose, with its reason, if needed.
- The panel parts and the Upcoming bars stay in their lazy chunks.

## Risks / Trade-offs

- [The date moving from the first slot to the last surprises users of 0.21] → it matches the owner's direction and every list changes at once. The changelog says so.
- [`first baseline` grid alignment with a textarea in the panel head] → the panel head uses a measured offset instead, and the stories pin it in light, dark, 375 and 1280 px.
- [Summarised Upcoming hides a task someone looks for] → search and the day's bar count still find it, and In full is one option away.

## Migration Plan

Ship as one change. The new pref field is additive, and rollback is a revert: the field's rows stay and are ignored. The interface guide and design-system docs update in the same pull request.

## Decided for the night (2026-11-09)

The owner asked for the open OpenSpec changes to be implemented overnight; each open question below was decided with its recommendation, for the owner to review and overturn in the morning.

### The questions as asked

1. **Merge History into Activity?** Recommendation: not now (D6). With icons and counts the four tabs fit at 22 rem, and Activity (on the device, offline) and History (the server's log, online, with restore) differ in where they come from and when they work. If you want three tabs, a follow-up can put History behind an "Every change" switch inside Activity.
2. **Should Upcoming be Summarised by default for existing users too?** Recommendation: yes. Calm by default is the point, nothing is hidden that the bar does not count, and In full is one choice in the display panel.
3. **Should the brand line show the version always, or only on hover?** Recommendation: always, small and faint. It answers "what am I running" without a trip to Settings, and it is where the What's new dot can live without a badge in the chrome.
